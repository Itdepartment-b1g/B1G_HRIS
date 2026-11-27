/** Types that store one or more option labels in answer_choice. */
export function isChoiceAnswerType(answerType: string): boolean {
  return answerType === 'multiple_choice' || answerType === 'checkbox';
}

export function serializeAnswerChoice(
  answerType: string,
  value: string | number | string[] | undefined
): string | null {
  if (answerType === 'multiple_choice') {
    if (value === undefined || value === '') return null;
    return String(value);
  }
  if (answerType === 'checkbox') {
    const arr = Array.isArray(value) ? value.filter(Boolean) : [];
    return JSON.stringify(arr);
  }
  return null;
}

/** Parse checkbox answers stored as a JSON array string in answer_choice. */
export function parseCheckboxChoices(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function choiceLabelsFromAnswer(answerType: string, answerChoice: string | null | undefined): string[] {
  if (!answerChoice) return [];
  if (answerType === 'checkbox') return parseCheckboxChoices(answerChoice);
  return [answerChoice];
}
