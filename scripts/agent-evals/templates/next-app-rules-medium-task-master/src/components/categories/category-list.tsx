'use client';

import { useMemo } from 'react';
import { collection, orderBy, query } from 'firebase/firestore';
import { useCollection, useFirestore, useUser, useMemoFirebase } from '@/firebase';
import { Category } from '@/lib/types';
import { AddCategoryDialog } from './add-category-dialog';
import { Button } from '../ui/button';

interface CategoryListProps {
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
}

export function CategoryList({ selectedCategoryId, onSelectCategory }: CategoryListProps) {
  const { user } = useUser();
  const firestore = useFirestore();

  const categoriesQuery = useMemoFirebase(() => {
    if (!user) return null;
    return query(collection(firestore, `users/${user.uid}/categories`), orderBy('name', 'asc'));
  }, [firestore, user]);

  const { data: categories, isLoading } = useCollection<Category>(categoriesQuery);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground px-2">Categories</h3>
       <Button
        variant={selectedCategoryId === 'general' ? 'soft' : 'ghost'}
        className="justify-start"
        onClick={() => onSelectCategory('general')}
      >
        General
      </Button>
      {isLoading && <div>Loading categories...</div>}
      {categories?.map((category) => (
        <Button
          key={category.id}
          variant={selectedCategoryId === category.id ? 'soft' : 'ghost'}
          className="justify-start"
          onClick={() => onSelectCategory(category.id)}
        >
          {category.name}
        </Button>
      ))}
      <AddCategoryDialog />
    </div>
  );
}
