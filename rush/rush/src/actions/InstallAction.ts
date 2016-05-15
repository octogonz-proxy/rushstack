/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import readPackageTree = require('read-package-tree');

import CommandLineAction from '../commandLine/CommandLineAction';
import JsonFile from '../utilities/JsonFile';
import RushCommandLineParser from './RushCommandLineParser';
import RushConfig, { IRushLinkJson } from '../data/RushConfig';
import RushConfigProject from '../data/RushConfigProject';
import Package from '../data/Package';
import PackageLookup from '../data/PackageLookup';
import Utilities from '../utilities/Utilities';
import { CommandLineFlagParameter } from '../commandLine/CommandLineParameter';

export default class InstallAction extends CommandLineAction {
  private _parser: RushCommandLineParser;
  private _rushConfig: RushConfig;
  private _cleanInstall: CommandLineFlagParameter;
  private _cleanInstallFull: CommandLineFlagParameter;

  constructor(parser: RushCommandLineParser) {
    super({
      actionVerb: 'install',
      summary: 'Install NPM packages in the "common" folder',
      documentation: 'Install NPM packages in the "common" folder'
    });
    this._parser = parser;
  }

  protected onDefineParameters(): void {
    this._cleanInstall = this.defineFlagParameter({
      parameterLongName: '--clean-install',
      parameterShortName: '-c',
      description: 'Delete any previously installed files before installing;'
      + ' this takes longer but is the most reliable way to install'
    });
    this._cleanInstallFull = this.defineFlagParameter({
      parameterLongName: '--clean-install-full',
      parameterShortName: '-C',
      description: 'Like "--clean-install", but also deletes and reinstalls the NPM tool'
    });
  }

  protected onExecute(): void {
    this._rushConfig = this._rushConfig = RushConfig.loadFromDefaultLocation();

    // Create the rush home folder, something like "C:\Users\YourName\.rush"
    const rushHomeFolder: string = path.join(this._rushConfig.homeFolder, '.rush');

    if (!fs.existsSync(rushHomeFolder)) {
      console.log('Creating ' + rushHomeFolder);
      fs.mkdirSync(rushHomeFolder);
    }

    // Create the NPM tool folder, e.g. for version 1.2.3 it would be "C:\Users\YourName\.rush\npm-1.2.3"
    const npmToolFolder: string = path.join(rushHomeFolder, 'npm-' + this._rushConfig.npmVersion);
    const npmToolFlagFile: string = path.join(npmToolFolder, 'node_modules', 'LastInstall.txt');

    if (this._cleanInstallFull.value || !fs.existsSync(npmToolFlagFile)) {
      if (fs.existsSync(npmToolFolder)) {
        console.log('Deleting old folder contents "' + npmToolFolder + '"');
        Utilities.dangerouslyDeletePath(npmToolFolder);
      }
      Utilities.createFolderWithRetry(npmToolFolder);

      const npmPackageJson: PackageJson = {
        dependencies: { "npm": this._rushConfig.npmVersion },
        description: 'Temporary file generated by the Rush tool',
        name: 'local-npm-install',
        private: true,
        version: '0.0.0'
      };
      JsonFile.saveJsonFile(npmPackageJson, path.join(npmToolFolder, 'package.json'));

      console.log(os.EOL + 'Running "npm install" in ' + npmToolFolder);
      child_process.execSync('npm install', {
        cwd: npmToolFolder,
        stdio: [0, 1, 2] // (omit this to suppress gulp console output)
      });

      // Create the marker file to indicate a successful install
      fs.writeFileSync(npmToolFlagFile, '');
      console.log('Successfully installed NPM ' + this._rushConfig.npmVersion);
    } else {
      console.log('Found NPM in ' + npmToolFolder);
    }

    const npmToolFilename: string = path.join(npmToolFolder, 'node_modules', '.bin', 'npm');
    let needToPrune: boolean = true;

    if (this._cleanInstall.value || this._cleanInstallFull.value) {
      const commonNodeModulesFolder: string = path.join(this._rushConfig.commonFolder, 'node_modules');
      if (fs.existsSync(commonNodeModulesFolder)) {
        console.log('Deleting old folder contents "' + commonNodeModulesFolder + '"');
        Utilities.dangerouslyDeletePath(commonNodeModulesFolder);
        Utilities.createFolderWithRetry(commonNodeModulesFolder);
      }
      needToPrune = false;
    }

    // Compare the timestamps LastInstall.txt and package.json
    const commonNpmFlagFile: string = path.join(this._rushConfig.commonFolder,
      'node_modules', 'LastInstall.txt');
    const commonPackageJsonFilename: string = path.join(this._rushConfig.commonFolder,
      'package.json');

    if (Utilities.isFileTimestampCurrent(commonNpmFlagFile, commonPackageJsonFilename)) {
      console.log('The node_modules folder is current');
    } else {
      if (needToPrune) {
        console.log(os.EOL + 'Running "npm prune" in ' + this._rushConfig.commonFolder);
        child_process.execSync('"' + npmToolFilename + '" install', {
          cwd: this._rushConfig.commonFolder,
          stdio: [0, 1, 2] // (omit this to suppress gulp console output)
        });
      }

      // Next, run "npm install" in the common folder
      console.log(os.EOL + 'Running "npm install" in ' + this._rushConfig.commonFolder);
      child_process.execSync('"' + npmToolFilename + '" install', {
        cwd: this._rushConfig.commonFolder,
        stdio: [0, 1, 2] // (omit this to suppress gulp console output)
      });

      // Create the marker file to indicate a successful install
      fs.writeFileSync(commonNpmFlagFile, '');
    }

    console.log(os.EOL + 'The node_modules folder is up to date.');
  }
}
