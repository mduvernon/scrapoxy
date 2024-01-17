import { NgModule } from '@angular/core';
import {
    FormsModule,
    ReactiveFormsModule,
} from '@angular/forms';
import {
    ButtonModule,
    FormModule,
    GridModule,
    TableModule,
    TooltipModule,
} from '@coreui/angular';
import { IconModule } from '@coreui/icons-angular';
import {
    ConnectorprovidersModule,
    FingerprintModule,
    TablePaginationModule,
} from '@scrapoxy/frontend-sdk';
import { ConnectorFreeproxiesComponent } from './connector/connector.component';
import { CredentialFreeproxiesComponent } from './credential/credential.component';
import { ConnectorFreeproxiesFactory } from './freeproxies.factory';


@NgModule({
    imports: [
        ButtonModule,
        ConnectorprovidersModule,
        FingerprintModule,
        FormModule,
        FormsModule,
        GridModule,
        IconModule,
        ReactiveFormsModule,
        TableModule,
        TablePaginationModule,
        TooltipModule,
    ],
    declarations: [
        ConnectorFreeproxiesComponent, CredentialFreeproxiesComponent,
    ],
    providers: [
        ConnectorFreeproxiesFactory,
    ],
})
export class ConnectorFreeproxiesModule {
    constructor(private readonly factory: ConnectorFreeproxiesFactory) {
        this.factory.init();
    }
}
