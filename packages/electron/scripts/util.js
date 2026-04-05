const { exec } = require("node:child_process");
const { promisify } = require("node:util");

const execAsync = promisify(exec);

module.exports = {
  execAsync,
};
