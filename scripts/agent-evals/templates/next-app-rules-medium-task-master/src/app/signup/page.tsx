import { SignupForm } from '@/components/auth/signup-form';
import { TaskMasterIcon } from '@/components/icons';
import Link from 'next/link';

export default function SignupPage() {
  return (
    <div className="container relative grid h-screen flex-col items-center justify-center lg:max-w-none lg:grid-cols-2 lg:px-0">
      <div className="relative hidden h-full flex-col bg-muted p-10 text-white dark:border-r lg:flex">
         <div
          className="absolute inset-0 bg-primary"
        />
        <div className="relative z-20 flex items-center text-lg font-medium">
          <TaskMasterIcon className="mr-2 h-6 w-6" />
          TaskMaster
        </div>
        <div className="relative z-20 mt-auto">
          <blockquote className="space-y-2">
            <p className="text-lg">
              &ldquo;The key is not to prioritize what's on your schedule, but to schedule your priorities.&rdquo;
            </p>
            <footer className="text-sm">Stephen Covey</footer>
          </blockquote>
        </div>
      </div>
      <div className="lg:p-8">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
          <div className="flex flex-col space-y-2 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              Create an account
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and password to get started
            </p>
          </div>
          <SignupForm />
          <p className="px-8 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href="/login"
              className="underline underline-offset-4 hover:text-primary"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
