import ActivitySurveyTab from './ActivitySurveyTab';

const SurveyPage = () => (
  <div className="space-y-6">
    <div>
      <h1 className="text-2xl font-bold text-foreground">Employee Survey</h1>
      <p className="text-muted-foreground mt-1">Surveys and feedback</p>
    </div>
    <ActivitySurveyTab />
  </div>
);

export default SurveyPage;
