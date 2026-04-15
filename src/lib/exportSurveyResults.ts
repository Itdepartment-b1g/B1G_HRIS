/**
 * Survey Results Export — PDF, CSV, XLSX
 * Exports survey analytics: questions, answer types, and aggregated responses.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/lib/supabase';

export interface EmployeeAnswer {
  employee_id: string;
  employee_name: string;
  answer: string | number;
}

export interface QuestionAnalytics {
  question_id: string;
  question_text: string;
  answer_type: string;
  options?: string[];
  mc_counts?: Record<string, number>;
  rating_avg?: number;
  rating_counts?: Record<number, number>;
  text_responses?: string[];
  employee_answers?: EmployeeAnswer[];
}

export interface SurveyExportOptions {
  surveyId: string;
  format: 'pdf' | 'csv' | 'xlsx';
  survey?: { title: string; start_date: string; end_date: string };
  analytics?: QuestionAnalytics[];
  responseCount?: number;
  isAnonymous?: boolean;
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

function buildIndividualResponseRows(analytics: QuestionAnalytics[]): Array<{ question: string; employee: string; answer: string }> {
  const rows: Array<{ question: string; employee: string; answer: string }> = [];
  for (const a of analytics) {
    if (a.employee_answers && a.employee_answers.length > 0) {
      for (const ea of a.employee_answers) {
        rows.push({
          question: a.question_text,
          employee: ea.employee_name,
          answer: String(ea.answer),
        });
      }
    }
  }
  // Sort by employee name, then question
  rows.sort((a, b) => {
    const empCompare = a.employee.localeCompare(b.employee);
    return empCompare !== 0 ? empCompare : a.question.localeCompare(b.question);
  });
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
    .select('id, employee_id')
    .eq('survey_id', surveyId);
  const respIds = (respData || []).map((r) => r.id);

  // Get unique employee IDs and fetch employee data
  const employeeIds = [...new Set((respData || []).map((r) => r.employee_id).filter(Boolean))];
  const { data: empData } = await supabase
    .from('employees')
    .select('id, first_name, last_name')
    .in('id', employeeIds.length ? employeeIds : ['00000000-0000-0000-0000-000000000000']);

  const employeeMap = new Map<string, { first_name: string; last_name: string }>();
  for (const e of empData || []) {
    employeeMap.set(e.id, e);
  }

  const respEmployeeMap = new Map<string, { employee_id: string; employee_name: string }>();
  for (const r of respData || []) {
    const emp = r.employee_id ? employeeMap.get(r.employee_id) : null;
    respEmployeeMap.set(r.id, {
      employee_id: r.employee_id || 'anonymous',
      employee_name: emp ? `${emp.first_name} ${emp.last_name}` : (r.employee_id ? 'Unknown' : 'Anonymous'),
    });
  }

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
        employee_answers: [],
      };
      byQuestion.set(q.id, an);
    }
    const ans = a as { answer_choice?: string; answer_rating?: number; answer_text?: string; response_id: string };
    const emp = respEmployeeMap.get(ans.response_id);

    if (q.answer_type === 'multiple_choice' && ans.answer_choice) {
      an.mc_counts = an.mc_counts || {};
      an.mc_counts[ans.answer_choice] = (an.mc_counts[ans.answer_choice] || 0) + 1;
      if (emp) {
        an.employee_answers = an.employee_answers || [];
        an.employee_answers.push({ employee_id: emp.employee_id, employee_name: emp.employee_name, answer: ans.answer_choice });
      }
    }
    if (q.answer_type === 'rating' && ans.answer_rating != null) {
      const n = ans.answer_rating;
      an.rating_counts = an.rating_counts || {};
      an.rating_counts[n] = (an.rating_counts[n] || 0) + 1;
      if (emp) {
        an.employee_answers = an.employee_answers || [];
        an.employee_answers.push({ employee_id: emp.employee_id, employee_name: emp.employee_name, answer: n });
      }
    }
    if (q.answer_type === 'text' && ans.answer_text) {
      an.text_responses = an.text_responses || [];
      an.text_responses.push(ans.answer_text);
      if (emp) {
        an.employee_answers = an.employee_answers || [];
        an.employee_answers.push({ employee_id: emp.employee_id, employee_name: emp.employee_name, answer: ans.answer_text });
      }
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
    if (v.employee_answers) {
      v.employee_answers.sort((a, b) => a.employee_name.localeCompare(b.employee_name));
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
  const { surveyId, format, isAnonymous } = options;
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
  const individualRows = !isAnonymous ? buildIndividualResponseRows(analytics) : [];
  const title = survey.title;
  const dateRange = `${survey.start_date} – ${survey.end_date}`;
  const filename = `survey-results-${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${survey.start_date}`;

  if (format === 'csv') {
    // Summary sheet
    const headers = ['Question', 'Answer Type', 'Choice/Value', 'Count'];
    const lines = [
      'SUMMARY',
      headers.join(','),
      ...rows.map((r) =>
        [r.question, r.answerType, r.choiceOrValue, r.count].map(escapeCsvField).join(',')
      ),
    ];
    
    // Individual responses sheet (if not anonymous)
    if (!isAnonymous && individualRows.length > 0) {
      lines.push('', 'INDIVIDUAL RESPONSES', 'Question,Employee,Answer');
      lines.push(...individualRows.map((r) =>
        [r.question, r.employee, r.answer].map(escapeCsvField).join(',')
      ));
    }
    
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } else if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      ['Question', 'Answer Type', 'Choice/Value', 'Count'],
      ...rows.map((r) => [r.question, r.answerType, r.choiceOrValue, r.count]),
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    
    // Individual responses sheet (if not anonymous)
    if (!isAnonymous && individualRows.length > 0) {
      const individualData = [
        ['Question', 'Employee', 'Answer'],
        ...individualRows.map((r) => [r.question, r.employee, r.answer]),
      ];
      const individualWs = XLSX.utils.aoa_to_sheet(individualData);
      XLSX.utils.book_append_sheet(wb, individualWs, 'Individual Responses');
    }
    
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } else {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`${dateRange} — ${responseCount} response${responseCount !== 1 ? 's' : ''}`, 14, 28);
    if (isAnonymous) {
      doc.setTextColor(255, 165, 0);
      doc.text('Anonymous Survey - Individual responses not included', 14, 34);
      doc.setTextColor(0, 0, 0);
    }

    // Summary table
    const tableData = rows.map((r) => [r.question.slice(0, 60), r.answerType, r.choiceOrValue.slice(0, 40), r.count]);
    autoTable(doc, {
      startY: isAnonymous ? 38 : 36,
      head: [['Question', 'Type', 'Choice/Value', 'Count']],
      body: tableData,
      styles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 25 }, 2: { cellWidth: 55 }, 3: { cellWidth: 25 } },
    });

    // Add per-question individual response pages if not anonymous
    if (!isAnonymous && analytics.length > 0) {
      for (const q of analytics) {
        if (!q.employee_answers || q.employee_answers.length === 0) continue;

        doc.addPage();
        doc.setFontSize(14);
        doc.text('Individual Responses by Question', 14, 20);
        
        doc.setFontSize(11);
        doc.setTextColor(100, 100, 100);
        doc.text(`${q.question_text.slice(0, 80)}`, 14, 28);
        doc.setTextColor(0, 0, 0);
        
        doc.setFontSize(9);
        doc.text(`Type: ${q.answer_type} | ${q.employee_answers.length} response${q.employee_answers.length !== 1 ? 's' : ''}`, 14, 34);

        const questionData = q.employee_answers.map((ea) => [
          ea.employee_name.slice(0, 35),
          String(ea.answer).slice(0, 50),
        ]);

        autoTable(doc, {
          startY: 40,
          head: [['Employee', 'Answer']],
          body: questionData,
          styles: { fontSize: 9 },
          columnStyles: { 0: { cellWidth: 60 }, 1: { cellWidth: 100 } },
          headStyles: { fillColor: [80, 80, 80] },
        });
      }
    }

    doc.save(`${filename}.pdf`);
  }
}
