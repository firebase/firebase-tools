'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useDoc, useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { collection, query, orderBy, Timestamp, doc } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import Header from '@/components/layout/header';
import { Todo } from '@/lib/types';
import { SharedList } from '@/lib/types';

function SharedTaskItem({ task }: { task: Todo }) {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-3 transition-all">
      <Checkbox
        id={`task-${task.id}`}
        checked={task.completed}
        disabled
        className="h-5 w-5"
      />
      <div className="grid flex-1 gap-1">
        <label
          htmlFor={`task-${task.id}`}
          className={cn(
            'font-medium leading-none',
            task.completed && 'text-muted-foreground line-through'
          )}
        >
          {task.description}
        </label>
        {task.dueDate && (
          <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <CalendarIcon className="h-3 w-3" />
            <span>{format(new Date(task.dueDate), 'PPP')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SharedListPage() {
  const params = useParams();
  const shareId = params.shareId as string;
  const firestore = useFirestore();

  const shareDocRef = useMemoFirebase(() => {
    if (!shareId) return null;
    return doc(firestore, 'shared', shareId);
  }, [firestore, shareId]);

  const { data: sharedListData, isLoading: isShareLoading } = useDoc<SharedList>(shareDocRef);

  const tasksQuery = useMemoFirebase(() => {
    if (!sharedListData) return null;
    return query(collection(firestore, `users/${sharedListData.userId}/tasks`), orderBy('createdAt', 'desc'));
  }, [firestore, sharedListData]);

  const { data: tasks, isLoading: areTasksLoading } = useCollection<Omit<Todo, 'id' | 'dueDate' | 'createdAt'> & { dueDate: Timestamp | null, createdAt: Timestamp }>(tasksQuery);

  const mappedTasks: Todo[] | null = useMemo(() => {
    if (!tasks) return null;
    return tasks.map(task => ({
        ...task,
        dueDate: task.dueDate ? task.dueDate.toDate() : null,
        createdAt: task.createdAt ? task.createdAt.toDate() : new Date(),
    }));
  }, [tasks]);

  const isLoading = isShareLoading || areTasksLoading;

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col items-center gap-4 p-4 md:gap-8 md:p-8">
        <div className="w-full max-w-4xl">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Shared Task List</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : mappedTasks && mappedTasks.length > 0 ? (
                <div className="space-y-4">
                  {mappedTasks.map((task) => (
                    <SharedTaskItem key={task.id} task={task} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground" />
                  <h3 className="text-xl font-semibold">No tasks to display</h3>
                  <p className="text-muted-foreground">This shared list is empty or does not exist.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
