// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// 错误代码的特征
const ERROR_PATTERNS = [
	/return\s+(-1|false)/i,  // 返回-1或false的模式
	/error|err|fail|/i,  // 错误相关的字符
	/printf\s*\(\s*".*?(error|err|fail|失败|错误)/i,  // 错误打印
	/cout\s*<<\s*".*?(error|err|fail|失败|错误)/i,    // C++错误输出
];

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "foldeb" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('foldeb.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from foldeb!');
	});

	// 注册错误代码块折叠命令
	let foldErrorBlocks = vscode.commands.registerCommand('foldeb.foldErrorBlocks', () => {
		foldErrorCodeBlocks();
	});

	context.subscriptions.push(disposable);
	context.subscriptions.push(foldErrorBlocks);
}

/**
 * 折叠错误代码块的主函数
 */
async function foldErrorCodeBlocks() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		vscode.window.showInformationMessage('没有打开的编辑器');
		return;
	}

	// 检查是否是C/C++文件
	const languageId = editor.document.languageId;
	if (languageId !== 'c' && languageId !== 'cpp') {
		vscode.window.showInformationMessage('当前文件不是C/C++文件');
		return;
	}

	const document = editor.document;
	const text = document.getText();
	const lines = text.split(/\r?\n/);

	const foldingRanges: vscode.FoldingRange[] = [];
	const errorLines: number[] = [];

	// 第一步：识别错误行
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// 检查是否匹配任何错误模式
		if (ERROR_PATTERNS.some(pattern => pattern.test(line))) {
			errorLines.push(i);
		}
	}

	// 第二步：识别代码块并添加到折叠区域
	for (const lineNum of errorLines) {
		// 找出代码块的开始和结束
		const blockRange = findCodeBlock(document, lineNum);
		if (blockRange) {
			foldingRanges.push(new vscode.FoldingRange(blockRange.start, blockRange.end));
		}
	}

	// 第三步：应用折叠
	if (foldingRanges.length > 0) {
		await vscode.commands.executeCommand('editor.fold', {
			selectionLines: foldingRanges.map(range => range.start)
		});
		vscode.window.showInformationMessage(`已折叠 ${foldingRanges.length} 个错误代码块`);
	} else {
		vscode.window.showInformationMessage('未找到错误代码块');
	}
}

/**
 * 查找包含指定行的代码块
 * @param document 当前文档
 * @param lineNum 错误所在行
 * @returns 代码块的开始和结束行
 */
function findCodeBlock(document: vscode.TextDocument, lineNum: number): { start: number, end: number } | null {
	const text = document.getText();
	const lines = text.split(/\r?\n/);

	// 向上查找代码块的开始
	let startLine = lineNum;
	let braceCount = 0;
	let foundStart = false;

	// 首先查找当前行是否有左花括号
	if (lines[lineNum].includes('{')) {
		braceCount = 1;
		foundStart = true;

		// 寻找代码块真正的起始行（函数定义或if语句等）
		let searchLine = lineNum - 1;
		while (searchLine >= 0) {
			const line = lines[searchLine].trim();
			// 如果是空行或只有注释，继续向上查找
			if (line === '' || line.startsWith('//') || line.startsWith('/*')) {
				searchLine--;
				continue;
			}

			// 找到了可能的函数定义或控制语句
			if (/(if|for|while|switch|else|do|\w+\s*\()/.test(line) && !line.includes(';')) {
				startLine = searchLine;
				break;
			}

			// 如果找到了另一个代码块的结束，说明已经跨越了边界
			if (line.includes('}') && !line.includes('{')) {
				break;
			}

			searchLine--;
		}
	} else {
		// 向上查找左花括号
		for (let i = lineNum; i >= 0; i--) {
			const line = lines[i];
			if (line.includes('{')) {
				braceCount++;
				if (!foundStart) {
					startLine = i;
					foundStart = true;

					// 继续向上寻找函数或条件语句的起始行
					let searchLine = i - 1;
					while (searchLine >= 0) {
						const prevLine = lines[searchLine].trim();
						if (prevLine === '' || prevLine.startsWith('//')) {
							searchLine--;
							continue;
						}

						if (/(if|for|while|switch|else|do|\w+\s*\()/.test(prevLine) && !prevLine.includes(';')) {
							startLine = searchLine;
							break;
						}

						if (prevLine.includes('}')) {
							break;
						}

						searchLine--;
					}
				}
			}

			if (line.includes('}')) {
				braceCount--;
			}

			// 如果左右花括号平衡，说明已经跨越了代码块边界
			if (foundStart && braceCount === 0) {
				break;
			}
		}
	}

	// 向下查找代码块的结束（右花括号）
	let endLine = lineNum;
	braceCount = 0;
	let foundEnd = false;

	for (let i = startLine; i < lines.length; i++) {
		const line = lines[i];

		if (line.includes('{')) {
			braceCount++;
		}

		if (line.includes('}')) {
			braceCount--;
			if (braceCount === 0) {
				endLine = i;
				foundEnd = true;
				break;
			}
		}
	}

	if (foundStart && foundEnd) {
		return { start: startLine, end: endLine };
	}

	// 如果无法确定完整的代码块，则只折叠当前行
	return { start: lineNum, end: lineNum };
}

// This method is called when your extension is deactivated
export function deactivate() { }
