import { Component, Inject } from '@angular/core';
import { LOCALE_ID } from '@angular/core';

@Component({
  selector: 'app-foo',
  template: `Foo {{ locale }}`,
  styles: []
})
export class FooComponent {
  constructor(@Inject(LOCALE_ID) protected locale: string) {}
}
