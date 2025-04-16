import { log } from 'console';
import * as vscode from 'vscode';

// 错误处理关键字列表
const ERROR_KEYWORDS = ['return', 'goto', 'throw', 'break', 'continue'];

// 错误处理模式的正则表达式表格
const ERROR_PATTERNS: Record<string, RegExp[]> = {
	'return': [
		/return\s+(-1|false|null|NULL|nullptr|undefined|nil)/i,  // 返回错误值
		/return\s+(error|err|failure)/i,                           // 返回错误对象
		/return\s+[\w.]+\s*\.\s*(error|failure|err)/i              // 返回带错误属性的对象
	],
	'throw': [
		/throw\s+new\s+[\w.]+/,                                    // throw new Error
		/throw\s+[\w.]+/                                           // throw error
	],
	'break': [
		/break\s*;/                                                // 简单的break语句
	],
	'continue': [
		/continue\s*;/                                             // 简单的continue语句
	],
	'goto': [
		/goto\s+[\w_]+/                                            // goto 语句
	],
	'log': [
		// 匹配日志中包含错误信息的情况
		/\b(?:printf|log_e|log|console\.log)\s*\(\s*"(.*(error|failed|failure|err|invalid).*)"\s*\)/i
	]
};

// 条件判断模式的正则表达式表格
const CONDITION_PATTERNS: RegExp[] = [
	/if\s*\(\s*[\w.]+\s*==\s*(null|NULL|nullptr|nil|0)\s*\)/i,     // if (xxx == NULL)
	/if\s*\(\s*[\w.]+\s*===\s*(null|NULL|undefined|nil|0)\s*\)/i,  // if (xxx === null)
	/if\s*\(\s*[\w.]+\s*!=\s*[^=]\s*\)/i,                          // if (xxx != yyy)
	/if\s*\(\s*[\w.]+\s*<=?\s*\d+\s*\)/i,                       // if (xxx <= 0)
	/if\s*\(\s*[\w.]+(\.isEmpty\(\)|\.length\s*==\s*0)\s*\)/i      // if (xxx.isEmpty() or xxx.length == 0)
];

export function activate(context: vscode.ExtensionContext) {
	console.log('Foldeb 扩展已启动');

	let foldCommand = vscode.commands.registerCommand('foldeb.foldErrorBranches', foldErrorBranches);

	// 注册标准折叠范围提供器
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
		vscode.window.showInformationMessage('没有打开的编辑器');
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

		vscode.window.showInformationMessage(`已折叠 ${foldingRanges.length} 个错误处理分支`);
	} else {
		vscode.window.showInformationMessage('未找到错误处理分支');
	}
}

function findErrorBranches(lines: string[], document: vscode.TextDocument): vscode.FoldingRange[] {
	const foldingRanges: vscode.FoldingRange[] = [];

	const codeBlocks = analyzeCodeBlocks(lines);

	for (const block of codeBlocks) {
		if (isErrorHandlingBlock(block, lines)) {
			console.debug(`找到错误处理块: ${block.start + 1} - ${block.end + 1}`);
			foldingRanges.push(new vscode.FoldingRange(block.start - 1, block.end));
		}
	}

	return foldingRanges;
}

// 代码块结构
interface CodeBlock {
	start: number;    // 开始行号
	end: number;      // 结束行号
	indentLevel: number; // 缩进级别
}

// 分析代码块结构
function analyzeCodeBlocks(lines: string[]): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	const bracketStack: number[] = []; // 存储左括号的行号

	let currentIndentLevel = 0;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.startsWith('//') || line === '' || line.startsWith('#')) {
			continue;
		}
		const indentLevel = getIndentLevel(lines[i]);
		if (indentLevel > currentIndentLevel) {
			bracketStack.push(i);
			currentIndentLevel = indentLevel;
		} else if (indentLevel < currentIndentLevel) {
			// 结束当前代码块
			const start = bracketStack.pop();
			if (start !== undefined) {
				blocks.push({ start, end: i - 1, indentLevel: currentIndentLevel });
				// console.log(`代码块: ${start + 1} - ${i} (缩进级别: ${currentIndentLevel})`);
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
	if (block.indentLevel <= 4) {
		return false;
	}

	// 检查代码块前一行是否是条件判断
	if (block.start > 0 && isConditionStatement(lines[block.start - 1].trim())) {
		return true;
	}

	for (let i = block.start; i <= block.end; i++) {
		const line = lines[i].trim();
		if (line.startsWith('//') || line === '') {
			continue;
		}
		const indentLevel = getIndentLevel(lines[i]);
		if (indentLevel > block.indentLevel) {
			continue;
		}

		// 检查每个错误关键字
		for (const keyword of ERROR_KEYWORDS) {
			if (line.startsWith(keyword)) {
				// 使用正则表达式检查错误模式
				if (ERROR_PATTERNS[keyword]) {
					for (const pattern of ERROR_PATTERNS[keyword]) {
						if (pattern.test(line)) {
							return true;
						}
					}
				}
			}
		}
	}

	return false;
}

// 判断一行代码是否是条件判断语句
function isConditionStatement(line: string): boolean {
	for (const pattern of CONDITION_PATTERNS) {
		if (pattern.test(line)) {
			return true;
		}
	}
	return false;
}

// 停用插件
export function deactivate() { }
