/**
 * The example document (shown on the first visit and by "New > The welcome example") and the
 * templates offered by "New".
 */

/**
 * A document to start from.
 * @typedef {object} Sample
 * @property {string} name - the name of the new document.
 * @property {string} code - its Markdown.
 */

/** The welcome example. @type {Sample} */
export const START = {
    name: 'Welcome',
    code: `# Welcome to the Markdown Editor

Type on the left, read on the right: the preview shows the document as you
write. Make text **bold**, *italic*, ~~struck through~~ or \`code\`, and leave
an empty line for a new paragraph.[^1]

Click any text in the preview to edit it right there.

## Lists and tasks

- Headings appear in the **Outline** on the right.
- Links such as [the next section](#tables-and-math) are checked.
  1. Numbered lists count by themselves.
  2. Lists can be nested.

Tasks you tick in the preview are ticked in the code:

- [x] Write the first paragraph
- [ ] Add a picture (drag it into the editor)

## Tables and math

| Step   | Who   | Days |
|:-------|:-----:|-----:|
| Draft  | Anna  |    3 |
| Review | Ben   |    1 |

Math works inline, like $e^{i\\pi} + 1 = 0$, and on its own line:

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

> A quote: what you write stays in your browser.

\`\`\`js
console.log('Code blocks keep their formatting');
\`\`\`

[^1]: Footnotes go to the end of the document.
`,
};

/** The templates of "New", by the key of their menu entry. @type {Object<string, Sample>} */
export const TEMPLATES = {
    readme: {
        name: 'README',
        code: `# Project name

One sentence that says what the project does and for whom.

## Features

- First feature
- Second feature
- Third feature

## Installation

\`\`\`sh
git clone https://example.com/project.git
cd project
\`\`\`

## Usage

Explain the most common use with a short example.

\`\`\`sh
project --help
\`\`\`

## License

MIT
`,
    },
    article: {
        name: 'Article',
        code: `# The title of the article

*A short summary of what the reader learns - two or three lines.*

## Introduction

Start with the question or the problem the article answers.

## The main part

Explain the idea step by step. A list helps the reader:

1. The first step
2. The second step
3. The third step

> A quote or a key sentence that stands out.

## Conclusion

Sum up what the reader can take away.
`,
    },
    notes: {
        name: 'Meeting notes',
        code: `# Meeting notes

**Date:** \n**People:** \n

## Agenda

1. Topic one
2. Topic two

## Decisions

-

## Tasks

| Task | Who | Until |
|------|-----|-------|
|      |     |       |

## Next meeting

`,
    },
    checklist: {
        name: 'Checklist',
        code: `# Checklist

## Before

- [ ] First thing to do
- [ ] Second thing to do

## During

- [ ] Something to check

## After

- [ ] Send the summary
- [x] Click a box in the preview to check it
`,
    },
};
