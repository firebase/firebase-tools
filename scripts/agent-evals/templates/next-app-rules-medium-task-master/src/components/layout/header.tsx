import Link from 'next/link';
import { UserNav } from '@/components/auth/user-nav';
import { TaskMasterIcon } from '@/components/icons';

export default function Header({children}: {children?: React.ReactNode}) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="container flex h-14 max-w-screen-2xl items-center">
        <div className="mr-4 flex items-center">
          {children}
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <TaskMasterIcon className="h-6 w-6 text-primary" />
            <span className="font-bold sm:inline-block">
              TaskMaster
            </span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
          <UserNav />
        </div>
      </div>
    </header>
  );
}
