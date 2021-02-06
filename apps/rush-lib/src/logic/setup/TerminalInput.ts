// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as readline from 'readline';
import * as process from 'process';
import colors from 'colors';

import { KeyboardLoop } from './KeyboardLoop';
import { AnsiEscape } from '@rushstack/node-core-library';

export interface IBasePromptOptions {
  question: string;
}

export interface IPromptYesNoOptions extends IBasePromptOptions {
  defaultValue?: boolean | undefined;
}

export interface IPromptPasswordOptions extends IBasePromptOptions {
  /**
   * The string length must not be longer than 1.  An empty string means to show the input text.
   * @defaultValue `*`
   */
  passwordCharacter?: string;
}

export interface IPromptLineOptions extends IBasePromptOptions {}

class YesNoKeyboardLoop extends KeyboardLoop {
  public readonly options: IPromptYesNoOptions;
  public result: boolean | undefined = undefined;

  public constructor(options: IPromptYesNoOptions) {
    super();
    this.options = options;
  }

  protected onStart(): void {
    this.stderr.write(colors.green('==>') + ' ');
    this.stderr.write(colors.bold(this.options.question));
    let optionSuffix: string = '';
    switch (this.options.defaultValue) {
      case true:
        optionSuffix = '(Y/n)';
        break;
      case false:
        optionSuffix = '(y/N)';
        break;
      default:
        optionSuffix = '(y/n)';
        break;
    }
    this.stderr.write(' ' + colors.bold(optionSuffix) + ' ');
  }

  protected onKeypress(character: string, key: readline.Key): void {
    if (this.result !== undefined) {
      return;
    }

    switch (key.name) {
      case 'y':
        this.result = true;
        break;
      case 'n':
        this.result = false;
        break;
      case 'enter':
      case 'return':
        if (this.options.defaultValue !== undefined) {
          this.result = this.options.defaultValue;
        }
        break;
    }

    if (this.result !== undefined) {
      this.stderr.write(this.result ? 'Yes\n' : 'No\n');
      this.resolveAsync();
      return;
    }
  }
}

class PasswordKeyboardLoop extends KeyboardLoop {
  private readonly _options: IPromptPasswordOptions;
  private _startX: number = 0;
  private _printedY: number = 0;
  private _lastPrintedLength: number = 0;

  public result: string = '';

  public constructor(options: IPromptPasswordOptions) {
    super();
    this._options = options;
  }

  private _getLineWrapWidth(): number {
    return this.stderr.columns ? this.stderr.columns : 80;
  }

  protected onStart(): void {
    this.result = '';

    readline.cursorTo(this.stderr, 0);
    readline.clearLine(this.stderr, 1);
    const prefix: string = colors.green('==>') + ' ' + colors.bold(this._options.question) + ' ';

    this.stderr.write(prefix);
    let lineStartIndex: number = prefix.lastIndexOf('\n');
    if (lineStartIndex < 0) {
      lineStartIndex = 0;
    }
    const line: string = prefix.substring(lineStartIndex);
    this._startX = AnsiEscape.removeCodes(line).length % this._getLineWrapWidth();
  }

  protected onKeypress(character: string, key: readline.Key): void {
    switch (key.name) {
      case 'enter':
      case 'return':
        this.stderr.write('\n');
        this.resolveAsync();
        return;
      case 'backspace':
        this.result = this.result.substring(0, this.result.length - 1);
    }

    let printable: boolean = true;
    if (character === '') {
      printable = false;
    } else if (key.name && key.name.length !== 1 && key.name !== 'space') {
      printable = false;
    } else if (!key.name && !key.sequence) {
      printable = false;
    }

    if (printable) {
      this.result += character;
    }

    // Optimize rendering when we don't need to erase anything
    const needsClear: boolean = this.result.length < this._lastPrintedLength;
    this._lastPrintedLength = this.result.length;

    this.hideCursor();

    // Restore Y
    while (this._printedY > 0) {
      readline.cursorTo(this.stderr, 0);
      if (needsClear) {
        readline.clearLine(this.stderr, 1);
      }
      readline.moveCursor(this.stderr, 0, -1);
      --this._printedY;
    }

    // Restore X
    readline.cursorTo(this.stderr, this._startX);

    let i: number = 0;
    let column: number = this._startX;
    this._printedY = 0;
    let buffer: string = '';
    const passwordCharacter: string =
      this._options.passwordCharacter === undefined ? '*' : this._options.passwordCharacter.substr(0, 1);

    while (i < this.result.length) {
      if (passwordCharacter === '') {
        buffer += this.result.substr(i, 1);
      } else {
        buffer += passwordCharacter;
      }

      ++i;
      ++column;

      // -1 to avoid weird TTY behavior in final column
      if (column >= this._getLineWrapWidth() - 1) {
        column = 0;
        ++this._printedY;
        buffer += '\n';
      }
    }
    this.stderr.write(buffer);

    if (needsClear) {
      readline.clearLine(this.stderr, 1);
    }

    this.unhideCursor();
  }
}

export class TerminalInput {
  private static async _readLine(): Promise<string> {
    const readlineInterface: readline.Interface = readline.createInterface({ input: process.stdin });
    try {
      return await new Promise((resolve, reject) => {
        readlineInterface.question('', (answer: string) => {
          resolve(answer);
        });
      });
    } finally {
      readlineInterface.close();
    }
  }

  public static async promptYesNo(options: IPromptYesNoOptions): Promise<boolean> {
    const keyboardLoop: YesNoKeyboardLoop = new YesNoKeyboardLoop(options);
    await keyboardLoop.startAsync();
    return keyboardLoop.result!;
  }

  public static async promptLine(options: IPromptLineOptions): Promise<string> {
    const stderr: NodeJS.WriteStream = process.stderr;
    stderr.write(colors.green('==>') + ' ');
    stderr.write(colors.bold(options.question));
    stderr.write(' ');
    return await TerminalInput._readLine();
  }

  public static async promptPasswordLine(options: IPromptLineOptions): Promise<string> {
    const keyboardLoop: PasswordKeyboardLoop = new PasswordKeyboardLoop(options);
    await keyboardLoop.startAsync();
    return keyboardLoop.result;
  }
}
