/**
 * Survey Results Export — PDF, CSV, XLSX
 * Exports survey analytics: questions, answer types, and aggregated responses.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

export interface QuestionAnalytics {
  question_id: string;
  question_text: string;
  answer_type: string;
  options?: string[];
  mc_counts?: Record<string, number>;
  rating_avg?: number;
  rating_counts?: Record<number, number>;
  text_responses?: string[];
}

export interface SurveyExportOptions {
  surveyId: string;
  format: 'pdf' | 'csv' | 'xlsx';
  survey?: { title: string; start_date: string; end_date: string };
  analytics?: QuestionAnalytics[];
  responseCount?: number;
}

interface SurveyReportRow {
  question: string;
  answerType: string;
  choiceOrValue: string;
  count: string;
}

function escapeCsvField(val: string | number): string {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildReportRows(analytics: QuestionAnalytics[]): SurveyReportRow[] {
  const rows: SurveyReportRow[] = [];
  for (const a of analytics) {
    if (a.answer_type === 'multiple_choice' && a.mc_counts) {
      for (const [choice, count] of Object.entries(a.mc_counts)) {
        rows.push({
          question: a.question_text,
          answerType: a.answer_type,
          choiceOrValue: choice,
          count: String(count),
        });
      }
      if (Object.keys(a.mc_counts).length === 0) {
        rows.push({ question: a.question_text, answerType: a.answer_type, choiceOrValue: '(no responses)', count: '0' });
      }
    } else if (a.answer_type === 'rating') {
      rows.push({
        question: a.question_text,
        answerType: a.answer_type,
        choiceOrValue: 'Average',
        count: String(a.rating_avg?.toFixed(2) ?? '—'),
      });
      if (a.rating_counts) {
        for (const n of [1, 2, 3, 4, 5]) {
          const c = a.rating_counts[n] ?? 0;
          if (c > 0) {
            rows.push({
              question: a.question_text,
              answerType: a.answer_type,
              choiceOrValue: `Rating ${n}`,
              count: String(c),
            });
          }
        }
      }
    } else if (a.answer_type === 'text' && a.text_responses) {
      for (const resp of a.text_responses) {
        rows.push({
          question: a.question_text,
          answerType: a.answer_type,
          choiceOrValue: resp.slice(0, 500),
          count: '1',
        });
      }
      if (!a.text_responses.length) {
        rows.push({ question: a.question_text, answerType: a.answer_type, choiceOrValue: '(no responses)', count: '0' });
      }
    }
  }
  return rows;
}

async function fetchAnalytics(surveyId: string): Promise<{
  survey: { title: string; start_date: string; end_date: string };
  analytics: QuestionAnalytics[];
  responseCount: number;
}> {
  const { data: surveyData, error: surveyError } = await supabase
    .from('surveys')
    .select('title, start_date, end_date')
    .eq('id', surveyId)
    .single();

  if (surveyError || !surveyData)
    throw new Error(`Failed to fetch survey: ${surveyError?.message ?? 'Not found'}`);

  const { data: qData } = await supabase
    .from('survey_questions')
    .select('*')
    .eq('survey_id', surveyId)
    .order('sort_order');
  const questionsList = qData || [];

  const { count } = await supabase
    .from('survey_responses')
    .select('*', { count: 'exact', head: true })
    .eq('survey_id', surveyId);
  const { count: compCount } = await supabase
    .from('survey_completions')
    .select('*', { count: 'exact', head: true })
    .eq('survey_id', surveyId);
  const responseCount = (count || 0) + (compCount || 0);

  const { data: respData } = await supabase
    .from('survey_responses')
    .select('id')
    .eq('survey_id', surveyId);
  const respIds = (respData || []).map((r) => r.id);

  const { data: ansData } = await supabase
    .from('survey_answers')
    .select('*')
    .in('response_id', respIds.length ? respIds : ['00000000-0000-0000-0000-000000000000']);

  const qMap = new Map(questionsList.map((q: { id: string }) => [q.id, q]));
  const byQuestion = new Map<string, QuestionAnalytics>();

  for (const a of ansData || []) {
    const q = qMap.get(a.question_id) as { id: string; question_text: string; answer_type: string; options?: string[] } | undefined;
    if (!q) continue;
    let an = byQuestion.get(q.id);
    if (!an) {
      an = {
        question_id: q.id,
        question_text: q.question_text,
        answer_type: q.answer_type,
        options: (q.options as string[]) || [],
        mc_counts: {},
        rating_avg: 0,
        rating_counts: {},
        text_responses: [],
      };
      byQuestion.set(q.id, an);
    }
    const ans = a as { answer_choice?: string; answer_rating?: number; answer_text?: string };
    if (q.answer_type === 'multiple_choice' && ans.answer_choice) {
      an.mc_counts = an.mc_counts || {};
      an.mc_counts[ans.answer_choice] = (an.mc_counts[ans.answer_choice] || 0) + 1;
    }
    if (q.answer_type === 'rating' && ans.answer_rating != null) {
      const n = ans.answer_rating;
      an.rating_counts = an.rating_counts || {};
      an.rating_counts[n] = (an.rating_counts[n] || 0) + 1;
    }
    if (q.answer_type === 'text' && ans.answer_text) {
      an.text_responses = an.text_responses || [];
      an.text_responses.push(ans.answer_text);
    }
  }

  const result: QuestionAnalytics[] = [];
  for (const [, v] of byQuestion) {
    if (v.answer_type === 'rating' && v.rating_counts) {
      const entries = Object.entries(v.rating_counts);
      const sum = entries.reduce((s, [k, c]) => s + Number(k) * c, 0);
      const total = entries.reduce((s, [, c]) => s + c, 0);
      v.rating_avg = total > 0 ? sum / total : 0;
    }
    result.push(v);
  }

  return {
    survey: surveyData,
    analytics: result,
    responseCount,
  };
}

export async function exportSurveyResults(options: SurveyExportOptions): Promise<void> {
  const { surveyId, format } = options;
  let survey = options.survey;
  let analytics = options.analytics ?? [];
  let responseCount = options.responseCount ?? 0;

  if (!survey || analytics.length === 0) {
    const fetched = await fetchAnalytics(surveyId);
    survey = fetched.survey;
    analytics = fetched.analytics;
    responseCount = fetched.responseCount;
  }

  const rows = buildReportRows(analytics);
  const title = survey.title;
  const dateRange = `${survey.start_date} – ${survey.end_date}`;
  const filename = `survey-results-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${survey.start_date}`;

  if (format === 'csv') {
    const headers = ['Question', 'Answer Type', 'Choice/Value', 'Count'];
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        [r.question, r.answerType, r.choiceOrValue, r.count].map(escapeCsvField).join(',')
      ),
    ];
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (format === 'xlsx') {
    const wsData = [
      ['Question', 'Answer Type', 'Choice/Value', 'Count'],
      ...rows.map((r) => [r.question, r.answerType, r.choiceOrValue, r.count]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Survey Results');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } else {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`${dateRange} — ${responseCount} response${responseCount !== 1 ? 's' : ''}`, 14, 28);

    const tableData = rows.map((r) => [r.question.slice(0, 60), r.answerType, r.choiceOrValue.slice(0, 40), r.count]);
    autoTable(doc, {
      startY: 36,
      head: [['Question', 'Type', 'Choice/Value', 'Count']],
      body: tableData,
      styles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 25 }, 2: { cellWidth: 55 }, 3: { cellWidth: 25 } },
    });

    doc.save(`${filename}.pdf`);
  }
}
