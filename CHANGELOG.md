# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2024-08-04

### Added
- **scrollback_size tool**: New MCP tool for managing tmux history buffers with configurable line limits and memory management (c166f03)
- **send_keys tool**: Precise key control for sending special key sequences (Ctrl+C, arrow keys, etc.) to tmux sessions (88d98e2)
- **Comprehensive test suite**: Added 100% test coverage for tmux-manager with unit and integration tests (7bd2b67)
- **Session management**: Ability to join existing tmux sessions and dynamically add/remove windows (3623240, 51de001)
- **AI assistance documentation**: Added CLAUDE.md for better AI integration and development guidance (6ff8792)

### Changed
- **Major refactor**: Simplified MCP server architecture for reduced context usage and improved maintainability (3f123d5)
- **Package namespace**: Moved package to personal npm namespace from original modelcontextprotocol organization (44aa110)
- **Project metadata**: Updated to acknowledge fork from original modelcontextprotocol/servers repository and document tmux integration (fb7cfe1)
- **Server architecture**: Refactored server.js for improved testability with better separation of concerns (7c2f14a)
- **Documentation**: Updated EXAMPLES.md to reflect current API and added reference in README (03780be)

### Fixed
- **Test stability**: Resolved test suite idempotency and linting issues for consistent CI/CD (d1333ec)
- **ESLint compliance**: Fixed various linting issues and updated documentation for unspecified `lines` parameter (531e933, 29a355a)
- **Session listing**: Fixed listSessions to properly handle "-MCP" suffix on session names (b220695)
- **Error handling**: Corrected process.exit to throw conversion that was missed in refactor (9724e99)

### Security
- **Input validation**: Enhanced parameter validation and error handling throughout the codebase

## [2.x.x] - Previous Versions

This changelog documents changes since forking from the original [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) repository. For changes prior to the fork, please refer to the original repository's history.

---

## About This Fork

This project is a fork of the original MCP tmux server from the modelcontextprotocol organization, enhanced with:

- Improved session management and window handling
- Better error handling and validation
- Comprehensive test coverage
- Enhanced documentation and examples
- Additional tools for tmux control (scrollback management, precise key control)
- Simplified architecture for better maintainability

The fork maintains compatibility with the MCP protocol while providing a more robust and feature-rich tmux integration.