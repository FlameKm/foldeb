import { log } from 'console';
import * as vscode from 'vscode';

// 错误处理关键字列表
const ERROR_KEYWORDS = ['return', 'goto', 'throw', 'break', 'continue'];

export function activate(context: vscode.ExtensionContext) {
	console.log('Foldeb 扩展已启动');

	// const disposable = vscode.commands.registerCommand('foldeb.helloWorld', () => {
	// 	// The code you place here will be executed every time your command is executed
	// 	// Display a message box to the user
	// 	vscode.window.showInformationMessage('Hello World from foldeb!');
	// });

	// 注册命令
	let command = vscode.commands.registerCommand('foldeb.foldErrorBranches', foldErrorBranches);

	context.subscriptions.push(command);
	// context.subscriptions.push(disposable);
}

// 主要功能：折叠错误分支
async function foldErrorBranches() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('没有打开的编辑器');
		return;
	}

	const document = editor.document;
	const text = document.getText();
	const lines = text.split('\n');

	// 获取所有需要折叠的代码区域
	const foldingRanges = findErrorBranches(lines, document);

	// 执行折叠
	if (foldingRanges.length > 0) {
		await vscode.commands.executeCommand('editor.fold', {
			// selectionLines: foldingRanges.map(range => range.start)
		});
		vscode.window.showInformationMessage(`已折叠 ${foldingRanges.length} 个错误分支`);
	} else {
		vscode.window.showInformationMessage('未找到错误分支');
	}
}

// 查找需要折叠的错误分支区域
function findErrorBranches(lines: string[], document: vscode.TextDocument): vscode.FoldingRange[] {
	const foldingRanges: vscode.FoldingRange[] = [];

	const codeBlocks = analyzeCodeBlocks(lines);

	for (const block of codeBlocks) {
		if (isErrorHandlingBlock(block, lines)) {
			console.log(`找到错误处理块: ${block.start + 1} - ${block.end + 1}`);
			foldingRanges.push(new vscode.FoldingRange(block.start, block.end));
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
		if (line.startsWith('//') || line === '') {
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

// 判断代码块是否为错误处理块
function isErrorHandlingBlock(block: CodeBlock, lines: string[]): boolean {
	for (let i = block.start; i <= block.end; i++) {
		const line = lines[i].trim();
		if (line.startsWith('//') || line === '') {
			continue;
		}
		const indentLevel = getIndentLevel(lines[i]);
		if (indentLevel > block.indentLevel) {
			continue;
		}
		for (const keyword of ERROR_KEYWORDS) {
			if (line.startsWith(keyword)) {
				if (line.includes('return -1')) {
					return true;
				}
			}
		}
	}

	return false;
}

// 停用插件
export function deactivate() { }
