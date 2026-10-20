// Tiny test helper: no framework. Each file calls test(name, fn); summary prints at exit.
const assert = require("assert");
let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.log("FAIL " + name + "\n  " + (e && e.message)); }
}
process.on("exit", () => {
  console.log(`${require("path").basename(process.argv[1])}: ${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
});
module.exports = { test, assert, eq: assert.deepStrictEqual, ok: assert.ok, throws: assert.throws };
