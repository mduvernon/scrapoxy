import {
    Injectable,
    Type,
} from '@angular/core';
import { CONNECTOR_NIMBLEWAY_TYPE } from '@scrapoxy/common';
import { ConnectorNimblewayComponent } from './connector/connector.component';
import { CredentialNimblewayComponent } from './credential/credential.component';
import { EConnectorType } from '../providers.interface';
import { ConnectorprovidersService } from '../providers.service';
import type {
    IConnectorComponent,
    IConnectorConfig,
    IConnectorFactory,
    ICredentialComponent,
    IInstallComponent,
} from '../providers.interface';


@Injectable()
export class ConnectorNimblewayFactory implements IConnectorFactory {
    readonly type = CONNECTOR_NIMBLEWAY_TYPE;

    readonly config: IConnectorConfig = {
        name: 'Nimble',
        description: 'Nimble is an experience seamless data-gathering with high-performance residential proxies, optimized for superior quality and granular control.',
        url: 'https://tracking.nimbleway.com/SH4a',
        type: EConnectorType.DynamicIP,
        canInstall: false,
        canUninstall: false,
        useCertificate: false,
        canReplaceProxy: false,
    };

    constructor(connectorproviders: ConnectorprovidersService) {
        connectorproviders.register(this);
    }

    init() {
        // Nothing
    }

    getCredentialComponent(): Type<ICredentialComponent> {
        return CredentialNimblewayComponent;
    }

    getConnectorComponent(): Type<IConnectorComponent> {
        return ConnectorNimblewayComponent;
    }

    getInstallComponent(): Type<IInstallComponent> {
        throw new Error('Not implemented');
    }
}