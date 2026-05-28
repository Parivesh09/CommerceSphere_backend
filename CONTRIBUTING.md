# Contributing to CommerceSphere

Thank you for your interest in contributing to CommerceSphere!

## Development Setup

1. Fork and clone the repository
2. Run `make setup` to install dependencies and start infrastructure
3. Create a feature branch: `git checkout -b feature/my-feature`
4. Make your changes
5. Run tests: `make test`
6. Run linter: `make lint`
7. Commit your changes
8. Push and create a pull request

## Project Structure

- `services/` - Microservices implementation
- `shared/` - Shared packages (types, utils)
- `scripts/` - Setup and utility scripts
- `.kiro/specs/` - Feature specifications and tasks

## Coding Standards

### TypeScript

- Use TypeScript strict mode
- Define explicit types for function parameters and return values
- Use interfaces for object shapes
- Avoid `any` type unless absolutely necessary

### Naming Conventions

- **Files**: kebab-case (e.g., `user-service.ts`)
- **Classes**: PascalCase (e.g., `UserService`)
- **Functions**: camelCase (e.g., `getUserById`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_RETRY_ATTEMPTS`)
- **Interfaces**: PascalCase with descriptive names (e.g., `UserRepository`)

### Code Organization

```typescript

import express from 'express';
import { createLogger } from '@commercesphere/utils';


interface ServiceConfig {
  port: number;
}


const DEFAULT_PORT = 3000;


export class MyService {

}
```

### Error Handling

Use custom error classes from `@commercesphere/utils`:

```typescript
import { NotFoundError, ValidationError } from '@commercesphere/utils';

if (!user) {
  throw new NotFoundError('User');
}

if (!email.includes('@')) {
  throw new ValidationError('Invalid email format');
}
```

### Logging

Use the shared logger:

```typescript
import { createLogger } from '@commercesphere/utils';

const logger = createLogger({ serviceName: 'my-service' });

logger.info('Processing request', { userId, orderId });
logger.error('Failed to process payment', { error, orderId });
```

## Testing Guidelines

### Unit Tests

- Test individual functions and classes
- Mock external dependencies
- Use descriptive test names
- Aim for >80% code coverage

```typescript
describe('UserService', () => {
  it('should create a user with hashed password', async () => {

    const userData = { email: 'test@example.com', password: 'password123' };
    

    const user = await userService.create(userData);
    

    expect(user.password).not.toBe('password123');
    expect(user.email).toBe('test@example.com');
  });
});
```

### Integration Tests

- Test service interactions
- Use Testcontainers for databases
- Test happy paths and error scenarios

### Property-Based Tests

- Test universal properties
- Use appropriate PBT library (fast-check for TypeScript)
- Reference design document properties

```typescript

it('should always hash passwords with bcrypt', () => {
  fc.assert(
    fc.asyncProperty(fc.string(), async (password) => {
      const user = await userService.register({ email: 'test@example.com', password });
      expect(user.password).not.toBe(password);
      expect(await bcrypt.compare(password, user.password)).toBe(true);
    })
  );
});
```

## Commit Messages

Follow conventional commits:

- `feat: add user registration endpoint`
- `fix: resolve race condition in inventory reservation`
- `docs: update API documentation`
- `test: add property tests for order saga`
- `refactor: extract payment processing logic`
- `chore: update dependencies`

## Pull Request Process

1. Update documentation if needed
2. Add tests for new features
3. Ensure all tests pass
4. Update CHANGELOG.md
5. Request review from maintainers

## Adding a New Service

1. Create service directory: `services/my-service/`
2. Add `package.json` with dependencies
3. Add `tsconfig.json` extending base config
4. Create `src/index.ts` entry point
5. Add service to `docker-compose.yml` if needed
6. Update documentation

## Adding Shared Utilities

1. Add to `shared/utils/src/`
2. Export from `shared/utils/src/index.ts`
3. Rebuild: `cd shared/utils && npm run build`
4. Document usage in README

## Database Migrations

- Use a migration tool (e.g., node-pg-migrate)
- Create migrations in `services/<service>/migrations/`
- Name migrations with timestamp: `1234567890_create_users_table.sql`
- Always provide up and down migrations

## Event Schema Changes

1. Update types in `shared/types/src/event.ts`
2. Increment event version number
3. Ensure backward compatibility
4. Update consuming services
5. Document breaking changes

## Performance Guidelines

- Use database indexes for frequently queried fields
- Implement caching for read-heavy operations
- Use connection pooling for databases
- Implement pagination for list endpoints
- Monitor query performance

## Security Guidelines

- Never commit secrets or credentials
- Use environment variables for configuration
- Validate and sanitize all user input
- Use parameterized queries to prevent SQL injection
- Implement rate limiting on public endpoints
- Use HTTPS in production
- Keep dependencies updated

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for design changes
- Add JSDoc comments for public APIs
- Include examples in documentation

## Questions?

- Check existing documentation
- Review the design document in `.kiro/specs/`
- Ask in pull request comments
- Open an issue for discussion

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
