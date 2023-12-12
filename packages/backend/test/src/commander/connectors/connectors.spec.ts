import { Logger } from '@nestjs/common';
import {
    ConnectorNameAlreadyExistsError,
    ConnectorNotFoundError,
    ConnectorRemoveError,
    ConnectorUpdateError,
    ValidationError,
} from '@scrapoxy/backend-sdk';
import {
    CommanderApp,
    MasterApp,
    TestServers,
    waitFor,
} from '@scrapoxy/backend-test-sdk';
import {
    CloudlocalApp,
    SUBSCRIPTION_LOCAL_DEFAULTS,
} from '@scrapoxy/cloudlocal';
import {
    EEventScope,
    EventsConnectorsClient,
    EventsProjectClient,
    ONE_MINUTE_IN_MS,
} from '@scrapoxy/common';
import { CONNECTOR_CLOUDLOCAL_TYPE } from '@scrapoxy/connector-cloudlocal-sdk';
import { v4 as uuid } from 'uuid';
import type {
    IConnectorToCreate,
    IConnectorToUpdate,
    IConnectorView,
    ICredentialView,
    IProjectData,
} from '@scrapoxy/common';
import type {
    IConnectorCloudlocalConfig,
    IConnectorCloudlocalCredential,
} from '@scrapoxy/connector-cloudlocal-backend';


describe(
    'Commander - Connectors',
    () => {
        const logger = new Logger();
        const
            cloudlocalApp = new CloudlocalApp(logger),
            cloudlocalConfig: IConnectorCloudlocalConfig = {
                region: 'europe',
                size: 'small',
                imageId: void 0,

            },
            cloudlocalConfig2: IConnectorCloudlocalConfig = {
                region: 'asia',
                size: 'large',
                imageId: void 0,

            },
            servers = new TestServers();
        let
            clientConnectors: EventsConnectorsClient,
            clientProject: EventsProjectClient,
            commanderApp: CommanderApp,
            connector: IConnectorView,
            connector2: IConnectorView,
            connectorToCreate: IConnectorToCreate,
            connectorToCreate2: IConnectorToCreate,
            connectorToUpdate: IConnectorToUpdate,
            credential: ICredentialView,
            credential2: ICredentialView,
            masterApp: MasterApp,
            project: IProjectData;

        beforeAll(async() => {
            // Start target & local cloud
            await Promise.all([
                servers.listen(), cloudlocalApp.start(),
            ]);

            const subscriptionId = uuid();
            await cloudlocalApp.client.createSubscription({
                id: subscriptionId,
                ...SUBSCRIPTION_LOCAL_DEFAULTS,
            });

            const subscriptionId2 = uuid();
            await cloudlocalApp.client.createSubscription({
                id: subscriptionId2,
                ...SUBSCRIPTION_LOCAL_DEFAULTS,
            });

            // Start app
            commanderApp = CommanderApp.defaults({
                cloudlocalAppUrl: cloudlocalApp.url,
                fingerprintUrl: servers.urlFingerprint,
                logger,
            });
            await commanderApp.start();

            clientProject = new EventsProjectClient(commanderApp.events);
            clientConnectors = new EventsConnectorsClient(commanderApp.events);

            masterApp = MasterApp.defaults({
                cloudlocalAppUrl: cloudlocalApp.url,
                commanderApp,
                fingerprintUrl: servers.urlFingerprint,
                logger,
            });
            await masterApp.start();

            // Create project
            project = await commanderApp.frontendClient.createProject({
                name: 'myproject',
                autoRotate: true,
                autoRotateDelayRange: {
                    min: ONE_MINUTE_IN_MS * 30,
                    max: ONE_MINUTE_IN_MS * 30,
                },
                autoScaleUp: true,
                autoScaleDown: true,
                autoScaleDownDelay: ONE_MINUTE_IN_MS,
                cookieSession: true,
                mitm: true,
                proxiesMin: 1,
                useragentOverride: false,
            });

            // Create credentials
            const credentialConfig: IConnectorCloudlocalCredential = {
                subscriptionId,
            };
            credential = await commanderApp.frontendClient.createCredential(
                project.id,
                {
                    name: 'mycredential',
                    type: CONNECTOR_CLOUDLOCAL_TYPE,
                    config: credentialConfig,
                }
            );

            const credentialConfig2: IConnectorCloudlocalCredential = {
                subscriptionId: subscriptionId2,
            };
            credential2 = await commanderApp.frontendClient.createCredential(
                project.id,
                {
                    name: 'mycredential2',
                    type: CONNECTOR_CLOUDLOCAL_TYPE,
                    config: credentialConfig2,
                }
            );

            await waitFor(async() => {
                await Promise.all([
                    commanderApp.frontendClient.getCredentialById(
                        project.id,
                        credential.id
                    ),
                    commanderApp.frontendClient.getCredentialById(
                        project.id,
                        credential2.id
                    ),
                ]);
            });

            // Prepare connector to create
            connectorToCreate = {
                name: 'myconnector 2',
                proxiesMax: 2,
                credentialId: credential.id,
                config: cloudlocalConfig,
                certificateDurationInMs: 10 * ONE_MINUTE_IN_MS,
            };
            connectorToUpdate = {
                name: 'new name for connector',
                credentialId: credential.id,
                config: cloudlocalConfig,
            };

            connectorToCreate2 = {
                name: 'myconnector 1', // Check sort on name
                proxiesMax: 2,
                credentialId: credential.id,
                config: cloudlocalConfig2,
                certificateDurationInMs: 10 * ONE_MINUTE_IN_MS,
            };

            // Connect events
            await Promise.all([
                clientProject.subscribeAsync(project),
                clientConnectors.subscribeAsync(
                    project.id,
                    []
                ),
                commanderApp.events.registerAsync({
                    scope: EEventScope.PROJECT,
                    projectId: project.id,
                }),
            ]);
        });

        afterAll(async() => {
            await Promise.all([
                clientConnectors.unsubscribeAsync(), clientProject.unsubscribeAsync(),
            ]);

            await commanderApp.stop();

            await Promise.all([
                masterApp.stop(), cloudlocalApp.close(), servers.close(),
            ]);
        });

        it(
            'should not have main connector on project',
            async() => {
                const projectFound = await commanderApp.frontendClient.getProjectById(project.id);

                expect(projectFound.connectorDefaultId)
                    .toBeNull();
            }
        );

        it(
            'should not have connector',
            async() => {
                const views = await commanderApp.frontendClient.getAllProjectConnectorsAndProxiesById(project.id);
                expect(views)
                    .toHaveLength(0);
            }
        );

        it(
            'should not create unnamed connector',
            async() => {
                const create: any = {
                    name: void 0,
                    proxiesMax: 2,
                    credentialId: credential.id,
                    config: cloudlocalConfig,
                };

                await expect(commanderApp.frontendClient.createConnector(
                    project.id,
                    create
                ))
                    .rejects
                    .toThrowError(ValidationError);
            }
        );

        it(
            'should not create unsized connector',
            async() => {
                const create: any = {
                    name: 'unsized connector',
                    credentialId: credential.id,
                    config: cloudlocalConfig,
                };

                await expect(commanderApp.frontendClient.createConnector(
                    project.id,
                    create
                ))
                    .rejects
                    .toThrowError(ValidationError);
            }
        );

        it(
            'should not create negative sized connector',
            async() => {
                const create: IConnectorToCreate = {
                    name: 'negative connector',
                    credentialId: credential.id,
                    proxiesMax: -10,
                    config: cloudlocalConfig,
                    certificateDurationInMs: 10 * ONE_MINUTE_IN_MS,
                };

                await expect(commanderApp.frontendClient.createConnector(
                    project.id,
                    create
                ))
                    .rejects
                    .toThrowError(ValidationError);
            }
        );

        it(
            'should not create misconfigured connector',
            async() => {
                const create: IConnectorToCreate = {
                    name: 'misconfigured connector',
                    proxiesMax: 1,
                    credentialId: credential2.id,
                    config: {
                        name: void 0,
                    },
                    certificateDurationInMs: 10 * ONE_MINUTE_IN_MS,
                };

                await expect(commanderApp.frontendClient.createConnector(
                    project.id,
                    create
                ))
                    .rejects
                    .toThrowError(ValidationError);
            }
        );

        it(
            'should create a first connector',
            async() => {
                connector = await commanderApp.frontendClient.createConnector(
                    project.id,
                    connectorToCreate
                );

                expect(connector.name)
                    .toBe(connectorToCreate.name);
                expect(connector.type)
                    .toBe(credential.type);
                expect(connector.proxiesMax)
                    .toBe(connectorToCreate.proxiesMax);
                expect(connector.active)
                    .toBeFalsy();
                expect(connector.error)
                    .toBeNull();

                await waitFor(() => {
                    expect(clientConnectors.views)
                        .toHaveLength(1);

                    const connectorFoundClient = clientConnectors.views[ 0 ].connector;

                    expect(connectorFoundClient.name)
                        .toBe(connectorToCreate.name);
                    expect(connectorFoundClient.type)
                        .toBe(credential.type);
                    expect(connectorFoundClient.proxiesMax)
                        .toBe(connectorToCreate.proxiesMax);
                    expect(connectorFoundClient.active)
                        .toBeFalsy();
                    expect(connectorFoundClient.error)
                        .toBeNull();
                    expect(clientProject.project?.connectorDefaultId)
                        .toBe(connector.id);
                });

                const views = await commanderApp.frontendClient.getAllProjectConnectorsAndProxiesById(project.id);
                expect(views)
                    .toHaveLength(1);

                const connectorFound = await commanderApp.frontendClient.getConnectorById(
                    project.id,
                    connector.id
                );

                expect(connectorFound.name)
                    .toBe(connectorToCreate.name);
                expect(connectorFound.type)
                    .toBe(credential.type);
                expect(connectorFound.proxiesMax)
                    .toBe(connectorToCreate.proxiesMax);
                expect(connectorFound.active)
                    .toBeFalsy();
                expect(connectorFound.config)
                    .toEqual(connectorToCreate.config);
                expect(connectorFound.error)
                    .toBeNull();

                const projectFound = await commanderApp.frontendClient.getProjectById(project.id);
                expect(projectFound.connectorDefaultId)
                    .toBe(connector.id);
            }
        );

        it(
            'should not create a connector with a existing name',
            async() => {
                await expect(commanderApp.frontendClient.createConnector(
                    project.id,
                    connectorToCreate
                ))
                    .rejects
                    .toThrowError(ConnectorNameAlreadyExistsError);
            }
        );

        it(
            'should install the first connector',
            async() => {
                await commanderApp.frontendClient.installConnector(
                    project.id,
                    connector.id,
                    {
                        config: {},
                    }
                );

                await waitFor(async() => {
                    const connectorFound = await commanderApp.frontendClient.getConnectorById(
                        project.id,
                        connector.id
                    );
                    const connectorConfigFound = connectorFound.config as IConnectorCloudlocalConfig;
                    expect(connectorConfigFound.imageId?.length)
                        .toBeGreaterThan(0);
                });
            }
        );

        it(
            'should activate the connector',
            async() => {
                await expect(commanderApp.frontendClient.activateConnector(
                    project.id,
                    connector.id,
                    false
                ))
                    .rejects
                    .toThrowError(ConnectorUpdateError);

                await commanderApp.frontendClient.activateConnector(
                    project.id,
                    connector.id,
                    true
                );

                await waitFor(async() => {
                    const view = clientConnectors.views[ 0 ];
                    expect(view.connector.active)
                        .toBeTruthy();

                    expect(view.proxies)
                        .toHaveLength(connector.proxiesMax);
                });

                await expect(commanderApp.frontendClient.activateConnector(
                    project.id,
                    connector.id,
                    true
                ))
                    .rejects
                    .toThrowError(ConnectorUpdateError);
            }
        );

        it(
            'should not update an active connector',
            async() => {
                const update: IConnectorToUpdate = {
                    name: 'new name for connector',
                    credentialId: credential.id,
                    config: cloudlocalConfig,
                };

                await expect(commanderApp.frontendClient.updateConnector(
                    project.id,
                    connector.id,
                    update
                ))
                    .rejects
                    .toThrowError(ConnectorUpdateError);
            }
        );

        it(
            'should not remove an active connector',
            async() => {
                await expect(commanderApp.frontendClient.removeConnector(
                    project.id,
                    connector.id
                ))
                    .rejects
                    .toThrowError(ConnectorRemoveError);
            }
        );

        it(
            'should deactivate the connector',
            async() => {
                await commanderApp.frontendClient.activateConnector(
                    project.id,
                    connector.id,
                    false
                );

                await waitFor(async() => {
                    const view = clientConnectors.views[ 0 ];
                    expect(view.connector.active)
                        .toBeFalsy();

                    expect(view.proxies)
                        .toHaveLength(0);
                });
            }
        );

        it(
            'should not update connector to noname',
            async() => {
                const connectorUpdate: any = {
                    name: void 0,
                    proxiesMax: 2,
                    type: CONNECTOR_CLOUDLOCAL_TYPE,
                    config: cloudlocalConfig,
                };

                await expect(commanderApp.frontendClient.updateConnector(
                    project.id,
                    connector.id,
                    connectorUpdate
                ))
                    .rejects
                    .toThrowError(ValidationError);
            }
        );

        it(
            'should update the connector',
            async() => {
                connector = await commanderApp.frontendClient.updateConnector(
                    project.id,
                    connector.id,
                    connectorToUpdate
                );

                expect(connector.name)
                    .toBe(connectorToUpdate.name);
                expect(connector.type)
                    .toBe(credential.type);
                expect(connector.proxiesMax)
                    .toBe(connectorToCreate.proxiesMax);
                expect(connector.error)
                    .toBeNull();

                await waitFor(() => {
                    expect(clientConnectors.views)
                        .toHaveLength(1);

                    const connectorFoundClient = clientConnectors.views[ 0 ].connector;

                    expect(connectorFoundClient.name)
                        .toBe(connectorToUpdate.name);
                    expect(connectorFoundClient.type)
                        .toBe(credential.type);
                    expect(connectorFoundClient.proxiesMax)
                        .toBe(connectorToCreate.proxiesMax);
                    expect(connectorFoundClient.error)
                        .toBeNull();
                });

                const views = await commanderApp.frontendClient.getAllProjectConnectorsAndProxiesById(project.id);
                expect(views)
                    .toHaveLength(1);

                const connectorFound = await commanderApp.frontendClient.getConnectorById(
                    project.id,
                    connector.id
                );

                expect(connectorFound.name)
                    .toBe(connectorToUpdate.name);
                expect(connectorFound.credentialId)
                    .toBe(credential.id);
                expect(connectorFound.type)
                    .toBe(credential.type);
                expect(connectorFound.proxiesMax)
                    .toBe(connectorToCreate.proxiesMax);
                expect(connectorFound.error)
                    .toBeNull();
                expect(connectorFound.config)
                    .toEqual(connectorToUpdate.config);
            }
        );

        it(
            'should create a second connector',
            async() => {
                connector2 = await commanderApp.frontendClient.createConnector(
                    project.id,
                    connectorToCreate2
                );

                expect(connector2.name)
                    .toBe(connectorToCreate2.name);
                expect(connector2.type)
                    .toBe(credential.type);
                expect(connector2.proxiesMax)
                    .toBe(connectorToCreate2.proxiesMax);
                expect(connector2.active)
                    .toBeFalsy();
                expect(connector2.error)
                    .toBeNull();

                await waitFor(() => {
                    expect(clientConnectors.views)
                        .toHaveLength(2);

                    // Get first element because there are sorted on name
                    const connectorFoundClient = clientConnectors.views[ 0 ].connector;

                    expect(connectorFoundClient.name)
                        .toBe(connectorToCreate2.name);
                    expect(connectorFoundClient.type)
                        .toBe(credential.type);
                    expect(connectorFoundClient.proxiesMax)
                        .toBe(connectorToCreate2.proxiesMax);
                    expect(connectorFoundClient.active)
                        .toBeFalsy();
                    expect(connectorFoundClient.error)
                        .toBeNull();

                    expect(clientProject.project?.connectorDefaultId)
                        .toBe(connector.id);
                });

                const views = await commanderApp.frontendClient.getAllProjectConnectorsAndProxiesById(project.id);
                expect(views)
                    .toHaveLength(2);

                const connectorFound = await commanderApp.frontendClient.getConnectorById(
                    project.id,
                    connector2.id
                );

                expect(connectorFound.name)
                    .toBe(connectorToCreate2.name);
                expect(connectorFound.credentialId)
                    .toBe(credential.id);
                expect(connectorFound.type)
                    .toBe(credential.type);
                expect(connectorFound.proxiesMax)
                    .toBe(connectorToCreate2.proxiesMax);
                expect(connectorFound.active)
                    .toBeFalsy();
                expect(connectorFound.error)
                    .toBeNull();
                expect(connectorFound.config)
                    .toEqual(connectorToCreate2.config);

                const projectFound = await commanderApp.frontendClient.getProjectById(project.id);
                expect(projectFound.connectorDefaultId)
                    .toBe(connector.id); // Stay the same connector
            }
        );

        it(
            'should not update the second connector with the name of the first connector',
            async() => {
                await expect(commanderApp.frontendClient.updateConnector(
                    project.id,
                    connector2.id,
                    connectorToUpdate
                ))
                    .rejects
                    .toThrowError(ConnectorNameAlreadyExistsError);
            }
        );

        it(
            'should not remove an unknown connector',
            async() => {
                await expect(commanderApp.frontendClient.removeConnector(
                    project.id,
                    uuid()
                ))
                    .rejects
                    .toThrowError(ConnectorNotFoundError);
            }
        );

        it(
            'should remove the first connector',
            async() => {
                await commanderApp.frontendClient.removeConnector(
                    project.id,
                    connector.id
                );

                await waitFor(() => {
                    expect(clientConnectors.views)
                        .toHaveLength(1);

                    expect(clientProject.project?.connectorDefaultId)
                        .toBe(connector2.id);
                });

                const views = await commanderApp.frontendClient.getAllProjectConnectorsAndProxiesById(project.id);
                expect(views)
                    .toHaveLength(1);

                const projectFound = await commanderApp.frontendClient.getProjectById(project.id);
                expect(projectFound.connectorDefaultId)
                    .toBe(connector2.id);
            }
        );

        it(
            'should remove the second connector',
            async() => {
                await commanderApp.frontendClient.removeConnector(
                    project.id,
                    connector2.id
                );

                await waitFor(() => {
                    expect(clientConnectors.views)
                        .toHaveLength(0);
                });

                const views = await commanderApp.frontendClient.getAllProjectConnectorsAndProxiesById(project.id);
                expect(views)
                    .toHaveLength(0);
            }
        );

        it(
            'should not have main connector on project',
            async() => {
                const projectFound = await commanderApp.frontendClient.getProjectById(project.id);

                await waitFor(() => {
                    expect(clientProject.project?.connectorDefaultId)
                        .toBeNull();
                });

                expect(projectFound.connectorDefaultId)
                    .toBeNull();
            }
        );
    }
);