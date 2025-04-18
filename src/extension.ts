import { log } from 'console';
import * as vscode from 'vscode';

const ERROR_KEYWORDS = ['return', 'goto', 'throw', 'break', 'continue'];

const ERROR_PATTERNS: Record<string, RegExp[]> = {
	'return': [
		/return\s+(-1|false|null|NULL|nullptr|undefined|nil)/i,  // Return error values
		/return\s+(error|err|failure)/i,                           // Return error objects
		/return\s+[\w.]+\s*\.\s*(error|failure|err)/i              // Return objects with error properties
	],
	'throw': [
		/throw\s+new\s+[\w.]+/,                                    // throw new Error
		/throw\s+[\w.]+/                                           // throw error
	],
	'goto': [
		/goto\s+[\w_]+/                                            // goto statement
	]
};

const CONDITION_PATTERNS: RegExp[] = [
	/if\s*\(\s*[\w.]+\s*==\s*(null|NULL|nullptr|nil|0)\s*\)/i,     // if (xxx == NULL)
	/if\s*\(\s*[\w.]+\s*===\s*(null|NULL|undefined|nil|0)\s*\)/i,  // if (xxx === null)
	/if\s*\(\s*[\w.]+\s*!=\s*[^=]\s*\)/i,                          // if (xxx != yyy)
	/if\s*\(\s*[\w.]+\s*<=?\s*\d+\s*\)/i,                       // if (xxx <= 0)
	/if\s*\(\s*[\w.]+(\.isEmpty\(\)|\.length\s*==\s*0)\s*\)/i      // if (xxx.isEmpty() or xxx.length == 0)
];

const LOG_PATTERNS: RegExp[] = [
	/\w*\(\s*"(.*(error|failed|failure|err|invalid).*)"/,
]

export function activate(context: vscode.ExtensionContext) {
	console.log('Foldeb extension activated');

	let foldCommand = vscode.commands.registerCommand('foldeb.foldErrorBranches', foldErrorBranches);

	// Register standard folding range provider
	const foldingProvider = vscode.languages.registerFoldingRangeProvider(
		['javascript', 'typescript', 'c', 'cpp', 'csharp', 'java', 'python'],
		{
			provideFoldingRanges(document) {
				const lines = document.getText().split('\n');
				return findErrorBranches(lines, document);
			}
		}
	);

	context.subscriptions.push(foldCommand, foldingProvider);
}

async function foldErrorBranches() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('No active editor');
		return;
	}

	const document = editor.document;
	const text = document.getText();
	const lines = text.split('\n');

	const foldingRanges = findErrorBranches(lines, document);

	if (foldingRanges.length > 0) {
		await vscode.commands.executeCommand('editor.fold', {
			selectionLines: foldingRanges.map(range => range.start),
		});

		vscode.window.showInformationMessage(`Folded ${foldingRanges.length} error handling branches`);
	} else {
		vscode.window.showInformationMessage('No error handling branches found');
	}
}

function findErrorBranches(lines: string[], document: vscode.TextDocument): vscode.FoldingRange[] {
	const foldingRanges: vscode.FoldingRange[] = [];

	const codeBlocks = analyzeCodeBlocks(lines);

	for (const block of codeBlocks) {
		if (isErrorHandlingBlock(block, lines)) {
			console.debug(`Found error handling block: ${block.startLine + 1}:${block.startColumn + 1} - ${block.endLine + 1}:${block.endColumn + 1}`);
			foldingRanges.push(new vscode.FoldingRange(block.startLine - 1, block.endLine));
		}
	}

	return foldingRanges;
}

interface CodeBlock {
	startLine: number;   // Start line number
	startColumn: number; // Start column number
	endLine: number;     // End line number
	endColumn: number;   // End column number
	indentLevel: number; // Indentation level
}

function analyzeCodeBlocks(lines: string[]): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const bracketStack: { line: number; column: number }[] = []; // Store line and column of left brackets

	let currentIndentLevel = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith('//') || line === '' || line.startsWith('#')) {
			continue;
		}
		const indentLevel = getIndentLevel(lines[i]);
		if (indentLevel > currentIndentLevel) {
			bracketStack.push({ line: i, column: 0 });
			currentIndentLevel = indentLevel;
		} else if (indentLevel < currentIndentLevel) {
			// End the current code block
			const start = bracketStack.pop();
			if (start !== undefined) {
				blocks.push({
					startLine : start.line,
					startColumn: start.column,
					endLine: i - 1,
					endColumn: lines[i - 1].length,
					indentLevel: currentIndentLevel });
				console.debug(`Code block: ${start.line + 1}:${start.column + 1} - ${i - 1 + 1}: ${lines[i - 1]} (Indentation level: ${currentIndentLevel})`);
			}
			currentIndentLevel = indentLevel;
		}
	}
	return blocks;
}

function getIndentLevel(line: string): number {
	const match = line.match(/^(\s*)/);
	return match ? match[1].length : 0;
}

function isErrorHandlingBlock(block: CodeBlock, lines: string[]): boolean {
	const keywordRegex = new RegExp(`\w*:$`);
	const line = lines[block.startLine - 1].trim();
	if (block.indentLevel <= 4 && !keywordRegex.test(line)) {
		return false;
	}

	// Check if the line before the block is a condition statement
	if (block.startLine > 0 && isConditionStatement(lines[block.startLine - 1].trim())) {
		return true;
	}

	for (let i = block.startLine; i <= block.endLine; i++) {
		const line = lines[i].trim();
		if (line.startsWith('//') || line === '') {
			continue;
		}
		const indentLevel = getIndentLevel(lines[i]);
		if (indentLevel > block.indentLevel) {
			continue;
		}

		// Check each error keyword
		for (const keyword of ERROR_KEYWORDS) {
			if (line.startsWith(keyword)) {
				if (ERROR_PATTERNS[keyword]) {
					for (const pattern of ERROR_PATTERNS[keyword]) {
						if (pattern.test(line)) {
							return true;
						}
					}
				}
			}
		}

		// Check log patterns
		for (const pattern of LOG_PATTERNS) {
			if (pattern.test(line)) {
				return true;
			}
		}
	}

	return false;
}

function isConditionStatement(line: string): boolean {
	for (const pattern of CONDITION_PATTERNS) {
		if (pattern.test(line)) {
			return true;
		}
	}
	return false;
}

export function deactivate() { }
