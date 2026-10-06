# 🤖 Copilot AI Documentation Guidelines

## Quick Reminders for Developers

When requesting documentation from Copilot AI, **always include this in your request**:

### 📍 Location Instruction

```
Save this documentation to: docs/ai/[DESCRIPTIVE_FILENAME].md
```

### 📝 Naming Convention

Use UPPERCASE with underscores for AI-generated docs:

- ✅ `docs/ai/FEATURE_NAME_GUIDE.md`
- ✅ `docs/ai/FIX_ISSUE_DESCRIPTION.md`
- ✅ `docs/ai/IMPLEMENTATION_DETAILS.md`
- ❌ `docs/ai/feature-guide.md` (lowercase)
- ❌ `FEATURE_GUIDE.md` (root level)

### 🎯 Example Copilot Requests

#### For Implementation Guides

```
Create a comprehensive implementation guide for [FEATURE] and save it to:
docs/ai/[FEATURE]_IMPLEMENTATION.md

Include:
1. Overview and purpose
2. Prerequisites
3. Step-by-step implementation
4. Code examples
5. Configuration options
6. Troubleshooting section
```

#### For Bug Fixes

```
Create a fix documentation for [BUG/ISSUE] and save it to:
docs/ai/FIX_[ISSUE_DESCRIPTION].md

Include:
1. Problem description
2. Root cause analysis
3. Solution steps
4. Code changes (if applicable)
5. Testing verification
6. Prevention tips
```

#### For Architecture/Design

```
Document the [COMPONENT/SYSTEM] architecture and save it to:
docs/ai/[COMPONENT]_ARCHITECTURE.md

Include:
1. System overview diagram (ASCII art or description)
2. Component responsibilities
3. Data flow
4. Integration points
5. Performance considerations
6. Scalability notes
```

### ✨ Best Practices

1. **Be Specific** - Include context about your project in requests
2. **Add Headers** - Request a timestamp and creation date in the document
3. **Include Examples** - Ask for practical code examples
4. **Request Validation** - Ask Copilot to verify the information
5. **Add TOC** - Request a table of contents for longer docs
6. **Link References** - Ask for links to related documentation

### 📋 Template for New Documentation

When creating new docs, Copilot should follow this structure:

```markdown
# [Title]

**Created**: [Date]
**Last Updated**: [Date]
**Author(s)**: Copilot AI

## Overview

[Brief description of what this document covers]

## Table of Contents

1. [Section 1](#section-1)
2. [Section 2](#section-2)
   ...

## Section 1

[Content here]

### Subsection

[Detailed content]

## Troubleshooting

[Common issues and solutions]

## References

- [Link to related docs](./path/to/doc.md)
- [External reference](https://example.com)

## Related Documentation

- See also: [`docs/ai/OTHER_RELATED_DOC.md`](./OTHER_RELATED_DOC.md)
```

### 🔄 Workflow

1. **Request** → Ask Copilot to create documentation
2. **Specify Path** → Always include `docs/ai/` in the request
3. **Review** → Check the generated content for accuracy
4. **Save** → Save directly to the correct location
5. **Git** → Commit with a descriptive message: `docs: add [description] documentation`

### ❓ FAQ

**Q: Can I save documentation to the root level?**  
A: No, all AI-generated docs go to `docs/ai/`. Manual documentation goes to `docs/`.

**Q: What about quick fixes and patches?**  
A: Use `docs/ai/FIX_` or `docs/ai/PATCH_` prefix for quick solutions.

**Q: Should I update existing docs in docs/ai/?**  
A: Yes! Keep docs current by updating timestamps and adding new sections.

**Q: How do I reference other AI docs?**  
A: Use relative links: `[Link](./OTHER_FILE.md)` or `[Link](../PARENT_FILE.md)`

---

**Remember**: This keeps our documentation organized and makes it easy for the team to know which docs were AI-assisted! 🎯
