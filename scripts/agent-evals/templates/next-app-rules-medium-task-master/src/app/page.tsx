'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/firebase';
import Header from '@/components/layout/header';
import TaskList from '@/components/tasks/task-list';
import { Loader2 } from 'lucide-react';
import { Sidebar, SidebarContent, SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { CategoryList } from '@/components/categories/category-list';
import { Button } from '@/components/ui/button';
import { TaskMasterIcon } from '@/components/icons';

export default function Home() {
  const { user, isUserLoading } = useUser();
  const router = useRouter();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>('all');

  useEffect(() => {
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router]);

  if (isUserLoading || !user) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
    <Sidebar>
      <SidebarContent className="p-2">
        <div className="flex flex-col gap-2">
          <Button
              variant={selectedCategoryId === 'all' ? 'soft' : 'ghost'}
              className="justify-start"
              onClick={() => setSelectedCategoryId('all')}
          >
              All Tasks
          </Button>
          <CategoryList selectedCategoryId={selectedCategoryId} onSelectCategory={setSelectedCategoryId} />
        </div>
      </SidebarContent>
    </Sidebar>
    <SidebarInset>
        <div className="flex min-h-screen w-full flex-col">
        <Header>
            <SidebarTrigger />
        </Header>
        <main className="flex flex-1 flex-col items-center gap-4 p-4 md:gap-8 md:p-8">
            <div className="w-full max-w-4xl">
            <TaskList selectedCategoryId={selectedCategoryId} />
            </div>
        </main>
        </div>
    </SidebarInset>
    </SidebarProvider>
  );
}
