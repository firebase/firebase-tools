import { Component, Inject } from '@angular/core';
import { LOCALE_ID } from '@angular/core';

@Component({
  selector: 'app-home',
  standalone: true,
  template: `Home {{ locale }}`,
  styles: []
})
export class HomeComponent {
  constructor(@Inject(LOCALE_ID) protected locale: string) {}
}
