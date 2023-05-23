import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { FooComponent } from './foo/foo.component';
import { HomeComponent } from './home/home.component';

const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'foo/:id', component: FooComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {
    initialNavigation: 'enabledBlocking'
})],
  exports: [RouterModule]
})
export class AppRoutingModule { }
