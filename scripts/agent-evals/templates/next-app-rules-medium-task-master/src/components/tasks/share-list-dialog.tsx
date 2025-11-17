'use client';

import { useState } from 'react';
import { doc, serverTimestamp } from 'firebase/firestore';
import { Copy, Share2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUser, useFirestore, addDocumentNonBlocking } from '@/firebase';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { collection } from 'firebase/firestore';

export function ShareListDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const { toast } = useToast();
  const { user } = useUser();
  const firestore = useFirestore();

  const handleShare = async () => {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to share a list.',
      });
      return;
    }
    setLoading(true);

    try {
      const sharedColRef = collection(firestore, 'shared');
      const newDoc = await addDocumentNonBlocking(sharedColRef, {
        userId: user.uid,
        createdAt: serverTimestamp(),
      });
      
      if(newDoc) {
        const link = `${window.location.origin}/shared/${newDoc.id}`;
        setShareLink(link);
        toast({ title: 'Share link generated.' });
      }

    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Could not generate share link.',
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareLink);
    toast({ title: 'Link copied to clipboard!' });
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
            setShareLink('');
        }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Share2 className="mr-2 h-4 w-4" /> Share List
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Your Task List</DialogTitle>
          <DialogDescription>
            Anyone with this link will be able to view your tasks.
          </DialogDescription>
        </DialogHeader>
        {shareLink ? (
          <div className="flex items-center space-x-2">
            <div className="grid flex-1 gap-2">
              <Label htmlFor="link" className="sr-only">
                Link
              </Label>
              <Input
                id="link"
                defaultValue={shareLink}
                readOnly
              />
            </div>
            <Button type="submit" size="sm" className="px-3" onClick={copyToClipboard}>
              <span className="sr-only">Copy</span>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : (
            <div className="flex justify-center">
                <Button onClick={handleShare} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Generate Link
                </Button>
            </div>
        )}
        <DialogFooter className="sm:justify-start">
            
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
