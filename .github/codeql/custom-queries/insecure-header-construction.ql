/**
 * @name Insecure Webex Authorization Header
 * @description Detects hardcoded or unsafe Authorization header construction
 * @kind problem
 * @problem.severity warning
 * @tags security
 */

import javascript

from PropertyWrite pw, Expr tokenExpr
where
  pw.getPropertyName() = "Authorization" and
  pw.getExpr() = tokenExpr and
  tokenExpr.toString().regexpMatch(".*Bearer.*")
select pw, "Avoid hardcoded or direct construction of Bearer tokens in Authorization headers."
