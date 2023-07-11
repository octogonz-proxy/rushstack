import { ITerminalProvider, ConsoleTerminalProvider } from '@rushstack/node-core-library';
import { IPhasedCommand, RushConfiguration, RushSession } from '@rushstack/rush-sdk';
import { apply } from './phasedInstallHandler';

const terminalProvider: ITerminalProvider = new ConsoleTerminalProvider();

const rushSession: RushSession = new RushSession({
  terminalProvider,
  getIsDebugMode: () => true
});

const configuration: RushConfiguration = RushConfiguration.loadFromDefaultLocation({
  // startingFolder:
});

async function start(): Promise<void> {
  await apply(
    { pluginName: 'rush-phased-install-plugin' },
    rushSession,
    configuration,
    {} as unknown as IPhasedCommand
  );
}

start().catch((e) => {
  console.error(e);
});
