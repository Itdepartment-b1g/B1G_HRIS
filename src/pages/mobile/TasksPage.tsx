import { Card, CardContent } from '@/components/ui/card';

const TasksPage = () => (
  <div className="space-y-6 max-w-2xl mx-auto pb-24">
    <div>
      <h1 className="text-2xl font-bold text-black">Your Today's Task</h1>
      <p className="text-gray-600 text-sm mt-1">Tasks assigned to you today</p>
    </div>

    <Card>
      <CardContent className="pt-8 pb-8">
        <div className="flex flex-col items-center justify-center text-center py-8">
          <p className="text-4xl mb-4">🎉</p>
          <p className="text-lg font-medium text-black">Hooray! All tasks are caught up</p>
          <p className="text-sm text-gray-600 mt-1">Break a leg, stay productive!</p>
        </div>
      </CardContent>
    </Card>
  </div>
);

export default TasksPage;
