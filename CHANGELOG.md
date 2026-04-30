# Changelog

## Unreleased

- Fix MCP server error 'Invalid input: expected record, received array' by wrapping arrays in objects at call sites and adding a safety check in `toContent`.
