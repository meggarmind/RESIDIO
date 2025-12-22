/**
 * Template Rendering for Notification System
 *
 * Renders notification templates with {{variable}} interpolation.
 * Supports subject, body, and HTML templates.
 */

import type {
  NotificationTemplate,
  RenderTemplateResult,
  TemplateVariable,
} from './types';

/**
 * Error thrown when template rendering fails
 */
export class TemplateRenderError extends Error {
  constructor(
    message: string,
    public templateName: string,
    public missingVariables?: string[]
  ) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

/**
 * Regex pattern for matching {{variable}} placeholders
 * Handles whitespace: {{ variable }}, {{variable}}, etc.
 */
const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Extract all variable names from a template string
 */
export function extractVariables(template: string): string[] {
  const matches = template.matchAll(VARIABLE_PATTERN);
  const variables = new Set<string>();

  for (const match of matches) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

/**
 * Validate that all required variables are provided
 */
export function validateVariables(
  templateVariables: TemplateVariable[],
  providedValues: Record<string, unknown>
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const variable of templateVariables) {
    if (variable.required) {
      const value = providedValues[variable.name];
      if (value === undefined || value === null || value === '') {
        missing.push(variable.name);
      }
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Interpolate variables into a template string
 *
 * Replaces {{variableName}} with the corresponding value from the variables object.
 * Missing variables are replaced with empty string (or can throw if strict mode).
 */
export function interpolate(
  template: string,
  variables: Record<string, unknown>,
  options?: { strict?: boolean }
): string {
  return template.replace(VARIABLE_PATTERN, (match, varName) => {
    const value = variables[varName];

    if (value === undefined || value === null) {
      if (options?.strict) {
        throw new TemplateRenderError(
          `Missing required variable: ${varName}`,
          'unknown',
          [varName]
        );
      }
      return '';
    }

    // Format different value types
    if (typeof value === 'number') {
      // Format numbers with commas for currency-like values
      return value.toLocaleString('en-NG');
    }

    if (value instanceof Date) {
      return value.toLocaleDateString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    return String(value);
  });
}

/**
 * Format a number as Nigerian Naira currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a date string for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Render a notification template with provided variables
 *
 * @param template - The notification template to render
 * @param variables - Variable values to interpolate
 * @param options - Rendering options
 * @returns Rendered subject, body, and HTML
 */
export function renderTemplate(
  template: NotificationTemplate,
  variables: Record<string, unknown>,
  options?: {
    validateRequired?: boolean;
    strict?: boolean;
  }
): RenderTemplateResult {
  // Optionally validate required variables
  if (options?.validateRequired !== false) {
    const validation = validateVariables(template.variables, variables);
    if (!validation.valid) {
      throw new TemplateRenderError(
        `Missing required variables: ${validation.missing.join(', ')}`,
        template.name,
        validation.missing
      );
    }
  }

  // Pre-process variables for formatting
  const processedVariables: Record<string, unknown> = { ...variables };

  // Auto-format common variable patterns
  for (const [key, value] of Object.entries(processedVariables)) {
    // Format amounts as currency
    if (key.includes('amount') && typeof value === 'number') {
      processedVariables[key] = formatCurrency(value);
    }
    // Format dates
    if (key.includes('date') && typeof value === 'string' && !isNaN(Date.parse(value))) {
      processedVariables[key] = formatDate(value);
    }
  }

  // Render subject, body, and HTML
  const subject = template.subject_template
    ? interpolate(template.subject_template, processedVariables, options)
    : null;

  const body = interpolate(template.body_template, processedVariables, options);

  const html = template.html_template
    ? interpolate(template.html_template, processedVariables, options)
    : null;

  return { subject, body, html };
}

/**
 * Create a preview of a template with sample values
 * Useful for template management UI
 */
export function previewTemplate(
  template: NotificationTemplate
): RenderTemplateResult {
  // Generate sample values for all variables
  const sampleValues: Record<string, string> = {};

  for (const variable of template.variables) {
    // Use descriptive placeholder values
    if (variable.name.includes('name')) {
      sampleValues[variable.name] = 'John Doe';
    } else if (variable.name.includes('email')) {
      sampleValues[variable.name] = 'john.doe@example.com';
    } else if (variable.name.includes('amount')) {
      sampleValues[variable.name] = '150,000.00';
    } else if (variable.name.includes('date')) {
      sampleValues[variable.name] = 'January 15, 2025';
    } else if (variable.name.includes('address') || variable.name.includes('house')) {
      sampleValues[variable.name] = '12 Palm Avenue';
    } else if (variable.name.includes('code') || variable.name.includes('number')) {
      sampleValues[variable.name] = 'INV-2025-001234';
    } else if (variable.name.includes('estate')) {
      sampleValues[variable.name] = 'Residio Estate';
    } else {
      sampleValues[variable.name] = `[${variable.name}]`;
    }
  }

  return renderTemplate(template, sampleValues, {
    validateRequired: false,
    strict: false,
  });
}

/**
 * Extract and describe all variables used in a template's text
 * Useful for validation and documentation
 */
export function analyzeTemplate(template: NotificationTemplate): {
  declaredVariables: TemplateVariable[];
  usedVariables: string[];
  undeclaredVariables: string[];
  unusedVariables: string[];
} {
  // Get variables used in all template text
  const subjectVars = template.subject_template
    ? extractVariables(template.subject_template)
    : [];
  const bodyVars = extractVariables(template.body_template);
  const htmlVars = template.html_template
    ? extractVariables(template.html_template)
    : [];

  const usedVariables = [...new Set([...subjectVars, ...bodyVars, ...htmlVars])];
  const declaredNames = template.variables.map(v => v.name);

  // Find undeclared variables (used but not in variables array)
  const undeclaredVariables = usedVariables.filter(
    name => !declaredNames.includes(name)
  );

  // Find unused variables (declared but not used)
  const unusedVariables = declaredNames.filter(
    name => !usedVariables.includes(name)
  );

  return {
    declaredVariables: template.variables,
    usedVariables,
    undeclaredVariables,
    unusedVariables,
  };
}

/**
 * Truncate body for preview storage (first 500 chars)
 */
export function truncateForPreview(body: string, maxLength = 500): string {
  if (body.length <= maxLength) {
    return body;
  }
  return body.substring(0, maxLength - 3) + '...';
}
