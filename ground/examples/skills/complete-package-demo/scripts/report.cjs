#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const output = process.argv[2];
if (!output) throw new Error('请传入工作区内的输出文件绝对路径');
const root = path.resolve(__dirname, '..');
const numbers = JSON.parse(fs.readFileSync(path.join(root, 'references/numbers.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'assets/template.txt'), 'utf8');
const sum = numbers.reduce((total, value) => total + value, 0);
fs.writeFileSync(output, template.replace('{{result}}', String(sum)), 'utf8');
console.log(`已生成：${output}`);
