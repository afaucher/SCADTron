/**
 * OpenSCAD language definition for Monaco Editor (Monarch tokenizer).
 * 
 * Based on the official OpenSCAD Playground language definition:
 * https://github.com/openscad/openscad-playground/blob/main/src/language/openscad-language.ts
 * Copyright 2021 Google LLC, licensed under GPL2+.
 * 
 * Extended with richer token categories from the Antyos/vscode-openscad grammar.
 */

import type * as Monaco from 'monaco-editor';

// --- Keyword lists ---

const controlKeywords = [
  'module', 'function', 'if', 'else', 'for', 'intersection_for',
  'let', 'each', 'assert', 'include', 'use',
];

const deprecated = [
  'assign', 'child', 'import_dxf', 'import_stl',
];

const transforms = [
  'scale', 'translate', 'rotate', 'multmatrix', 'color',
  'projection', 'hull', 'resize', 'mirror', 'minkowski', 'offset',
];

const booleanOps = [
  'union', 'difference', 'intersection',
];

const primitives3d = [
  'cube', 'sphere', 'cylinder', 'polyhedron',
];

const primitives2d = [
  'square', 'circle', 'polygon', 'text',
];

const extrude = [
  'linear_extrude', 'rotate_extrude',
];

const mathFunctions = [
  'abs', 'sign', 'floor', 'round', 'ceil', 'ln', 'len', 'log',
  'pow', 'sqrt', 'exp', 'rands', 'min', 'max', 'norm', 'cross',
];

const trigFunctions = [
  'sin', 'cos', 'asin', 'acos', 'tan', 'atan', 'atan2',
];

const otherBuiltins = [
  'concat', 'lookup', 'str', 'chr', 'ord', 'search',
  'version', 'version_num', 'parent_module',
  'children', 'echo', 'group', 'render',
  'import', 'dxf_dim', 'dxf_cross', 'surface',
];

const typeTests = [
  'is_undef', 'is_bool', 'is_num', 'is_string', 'is_list', 'is_function',
];

const constants = [
  'true', 'false', 'undef', 'PI',
];

// All builtins for the keyword matcher (single flat list)
const allBuiltinFunctions = [
  ...transforms, ...booleanOps, ...primitives3d, ...primitives2d,
  ...extrude, ...mathFunctions, ...trigFunctions, ...otherBuiltins, ...typeTests,
];

// --- Language Configuration ---

export const conf: Monaco.languages.LanguageConfiguration = {
  colorizedBracketPairs: [['{', '}'], ['(', ')'], ['[', ']']],
  wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  onEnterRules: [
    {
      // /** | */
      beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
      afterText: /^\s*\*\/$/,
      action: { indentAction: 2 /* IndentOutdent */, appendText: ' * ' },
    },
    {
      // /**
      beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
      action: { indentAction: 0 /* None */, appendText: ' * ' },
    },
    {
      //  * (continuing block comment)
      beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
      action: { indentAction: 0, appendText: '* ' },
    },
    {
      //  */ (end of block comment)
      beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
      action: { indentAction: 0, removeText: 1 },
    },
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"', notIn: ['string'] },
    { open: '/*', close: ' */', notIn: ['string'] },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
  folding: {
    markers: {
      start: /^\s*\/\/\s*#?region\b/,
      end: /^\s*\/\/\s*#?endregion\b/,
    },
  },
};

// --- Monarch Tokenizer ---

export const language: Monaco.languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.scad',

  keywords: controlKeywords,
  deprecated,
  builtinFunctions: allBuiltinFunctions,
  constants,

  operators: [
    '<=', '>=', '==', '!=',
    '+', '-', '*', '/', '%',
    '&&', '||', '!',
    '?', ':', '=',
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\[abfnrtv\\"']/,
  digits: /\d+/,

  tokenizer: {
    root: [
      [/[{}]/, 'delimiter.bracket'],
      { include: 'common' },
    ],

    common: [
      // Special $ variables
      [/\$[a-zA-Z_]\w*/, 'variable.predefined'],

      // Identifiers & keywords
      [/[a-z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@deprecated': 'invalid.deprecated',
          '@builtinFunctions': 'keyword.function',
          '@constants': 'constant.language',
          '@default': 'identifier',
        },
      }],

      // Upper-case identifiers (type-like)
      [/[A-Z][\w\$]*/, 'type.identifier'],

      { include: '@whitespace' },

      // Brackets
      [/[()\[\]]/, '@brackets'],
      [/[<>](?!@symbols)/, '@brackets'],
      [/!(?=([^=]|$))/, 'delimiter'],

      // Operators
      [/@symbols/, {
        cases: {
          '@operators': 'delimiter',
          '@default': '',
        },
      }],

      // Numbers
      [/(@digits)[eE]([\-+]?(@digits))?/, 'number.float'],
      [/(@digits)\.(@digits)([eE][\-+]?(@digits))?/, 'number.float'],
      [/(@digits)/, 'number'],

      // Delimiters
      [/[;,.]/, 'delimiter'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'],
      [/"/, 'string', '@string_double'],

      // Include paths
      [/<[^>]+>/, 'string.include'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, ''],
      [/\/\*\*(?!\/)/, 'comment.doc', '@doccomment'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\*\//, 'comment', '@pop'],
      [/[\/*]/, 'comment'],
    ],

    doccomment: [
      [/[^\/*]+/, 'comment.doc'],
      [/\*\//, 'comment.doc', '@pop'],
      [/[\/*]/, 'comment.doc'],
    ],

    string_double: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, 'string', '@pop'],
    ],

    bracketCounting: [
      [/\{/, 'delimiter.bracket', '@bracketCounting'],
      [/\}/, 'delimiter.bracket', '@pop'],
      { include: 'common' },
    ],
  },
};

// --- Registration function ---

export function registerOpenScadLanguage(monaco: typeof Monaco) {
  monaco.languages.register({
    id: 'openscad',
    extensions: ['.scad'],
    aliases: ['OpenSCAD', 'openscad', 'scad'],
    mimetypes: ['text/x-openscad'],
  });

  monaco.languages.setLanguageConfiguration('openscad', conf as any);
  monaco.languages.setMonarchTokensProvider('openscad', language);
}
