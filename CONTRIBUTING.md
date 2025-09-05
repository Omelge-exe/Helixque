# Contributing to Helixque

Thank you for your interest in contributing to Helixque! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Follow the setup instructions in the main README
4. Create a new branch for your feature/fix

## Development Setup

1. **Install dependencies for both frontend and backend**:
   ```bash
   # Backend
   cd backend && npm install
   
   # Frontend  
   cd ../my-app && npm install
   ```

2. **Start development servers**:
   ```bash
   # Terminal 1 - Backend
   cd backend && npm run dev
   
   # Terminal 2 - Frontend
   cd my-app && npm run dev
   ```

## Code Style

- Follow existing TypeScript and React patterns
- Use meaningful variable and function names
- Add comments for complex logic
- Ensure code is properly formatted

## Testing Your Changes

1. Test both frontend and backend functionality
2. Verify WebRTC connections work properly
3. Test edge cases like disconnections and reconnections
4. Ensure responsive design works on different screen sizes

## Submitting Changes

1. Commit your changes with clear, descriptive messages
2. Push to your fork
3. Create a Pull Request with:
   - Clear description of changes
   - Screenshots/videos for UI changes
   - Testing notes

## Areas for Contribution

- UI/UX improvements
- Performance optimizations
- Additional WebRTC features
- Mobile responsiveness
- Accessibility improvements
- Documentation updates
- Bug fixes

## Questions?

Feel free to open an issue for questions or discussion about potential contributions.