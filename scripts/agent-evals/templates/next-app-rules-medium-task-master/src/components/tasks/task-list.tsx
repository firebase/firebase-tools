'use client';

import { useMemo } from 'react';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { Todo } from '@/lib/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TaskItem } from './task-item';
import { AddTaskDialog } from './add-task-dialog';
import { FileText } from 'lucide-react';
import { collection, orderBy, query, Timestamp, where } from 'firebase/firestore';

interface TaskListProps {
  selectedCategoryId: string | null;
}

export default function TaskList({ selectedCategoryId }: TaskListProps) {
  const { user } = useUser();
  const firestore = useFirestore();

  const tasksQuery = useMemoFirebase(() => {
    if (!user) return null;
    const baseQuery = collection(firestore, `users/${user.uid}/tasks`);
    
    if (selectedCategoryId && selectedCategoryId !== 'all') {
      if(selectedCategoryId === 'general') {
        // query for tasks where categoryId is either not present or is null
        // Firestore does not support OR queries on different fields in this way.
        // We will query for tasks without categoryId, and client-side filter for null.
        // This assumes 'general' means tasks without a category.
        return query(baseQuery, where('categoryId', '==', null), orderBy('createdAt', 'desc'));
      }
      return query(baseQuery, where('categoryId', '==', selectedCategoryId), orderBy('createdAt', 'desc'));
    }
    
    return query(baseQuery, orderBy('createdAt', 'desc'));
  }, [firestore, user, selectedCategoryId]);

  const { data: tasks, isLoading } = useCollection<Omit<Todo, 'id' | 'dueDate' | 'createdAt'> & { dueDate: Timestamp | null, createdAt: Timestamp }>(tasksQuery);

  const mappedTasks: Todo[] | null = useMemo(() => {
    if (!tasks) return null;
    let filteredTasks = tasks;
    if (selectedCategoryId === 'general') {
        filteredTasks = tasks.filter(task => !task.categoryId);
    }

    return filteredTasks.map(task => ({
        ...task,
        dueDate: task.dueDate ? task.dueDate.toDate() : null,
        createdAt: task.createdAt ? task.createdAt.toDate() : new Date(),
    }));
  }, [tasks, selectedCategoryId]);


  if (!user) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>My Tasks</CardTitle>
        <AddTaskDialog selectedCategoryId={selectedCategoryId} />
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
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground" />
            <h3 className="text-xl font-semibold">No tasks yet</h3>
            <p className="text-muted-foreground">Add a new task to get started.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
