import { Routes } from '@angular/router';
import { FooComponent } from './foo/foo.component';
import { HomeComponent } from './home/home.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'foo/:id', component: FooComponent }
];
