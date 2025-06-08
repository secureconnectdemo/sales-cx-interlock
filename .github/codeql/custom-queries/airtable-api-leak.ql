/**
 * @name Airtable Base ID Disclosure
 * @description Finds hardcoded Airtable base IDs
 * @kind problem
 * @problem.severity warning
 * @tags security
 */

import javascript

from StringLiteral s
where s.getValue().regexpMatch("app[a-zA-Z0-9]{14}")
select s, "This looks like a hardcoded Airtable base ID. Use environment variables instead."
