'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Trash2 } from 'lucide-react';
import { doc } from 'firebase/firestore';

import { Todo } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { useFirestore, useUser, deleteDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { EditTaskDialog } from './edit-task-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"


interface TaskItemProps {
  task: Todo;
}

export function TaskItem({ task }: TaskItemProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();
  const [isCompleted, setIsCompleted] = useState(task.completed);

  const handleCompletionToggle = async (checked: boolean) => {
    if (!user) return;
    
    const taskRef = doc(firestore, `users/${user.uid}/tasks`, task.id);
    updateDocumentNonBlocking(taskRef, { completed: checked });
    
    toast({ title: `Task ${checked ? 'completed' : 'marked as pending'}.` });
    // No need to revert optimistically, onSnapshot will handle it
  };

  const handleDelete = async () => {
    if (!user) return;
    const taskRef = doc(firestore, `users/${user.uid}/tasks`, task.id);
    deleteDocumentNonBlocking(taskRef);
    toast({ title: 'Task deleted.' });
  };
  
  const onTaskUpdated = () => {
    // This function can be left empty as useCollection handles updates automatically
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border p-3 transition-all hover:bg-card/90">
      <Checkbox
        id={`task-${task.id}`}
        checked={task.completed}
        onCheckedChange={(checked) => handleCompletionToggle(Boolean(checked))}
        className="h-5 w-5"
      />
      <div className="grid flex-1 gap-1">
        <label
          htmlFor={`task-${task.id}`}
          className={cn(
            'font-medium leading-none cursor-pointer',
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
      <div className="flex items-center gap-2">
        <EditTaskDialog task={task} onTaskUpdated={onTaskUpdated} />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Delete task</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this task.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
