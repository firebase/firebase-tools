import { ApplicationConfig } from '@angular/core';
import { AppServerModule } from './app.server.module';

export const config: ApplicationConfig = {
    providers: [AppServerModule]
};
