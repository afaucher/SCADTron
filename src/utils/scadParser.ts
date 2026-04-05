export interface ScadParameter {
  name: string;
  value: string | number | boolean;
  type: 'number' | 'string' | 'boolean';
  min?: number;
  max?: number;
  step?: number;
  description?: string;
  lineIndex: number;
  originalLine: string;
}

export function parseScadParameters(code: string): ScadParameter[] {
  const lines = code.split('\n');
  const parameters: ScadParameter[] = [];

  // Regex to match variable assignments, optionally with a comment
  // e.g., var_name = 10; // [1:10] description
  const paramRegex = /^([a-zA-Z0-9_]+)\s*=\s*([^;]+);\s*(?:\/\/\s*(.*))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Stop parsing parameters if we hit a module or function definition
    if (line.startsWith('module ') || line.startsWith('function ')) {
      break;
    }

    const match = line.match(paramRegex);
    if (match) {
      const name = match[1];
      let rawValue = match[2].trim();
      const comment = match[3] ? match[3].trim() : '';

      let type: 'number' | 'string' | 'boolean' = 'string';
      let value: string | number | boolean = rawValue;

      if (rawValue === 'true' || rawValue === 'false') {
        type = 'boolean';
        value = rawValue === 'true';
      } else if (!isNaN(Number(rawValue))) {
        type = 'number';
        value = Number(rawValue);
      } else if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
        type = 'string';
        value = rawValue.slice(1, -1);
      } else {
        // Complex expression or array, skip for simple UI
        continue;
      }

      let min, max, step, description;

      // Parse customizer comment e.g. [0:1:10] or [0:10]
      if (comment.startsWith('[')) {
        const endBracket = comment.indexOf(']');
        if (endBracket !== -1) {
          const rangeStr = comment.slice(1, endBracket);
          const parts = rangeStr.split(':').map(Number);
          
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            min = parts[0];
            max = parts[1];
          } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
            min = parts[0];
            step = parts[1];
            max = parts[2];
          }

          description = comment.slice(endBracket + 1).trim();
        }
      } else {
        description = comment;
      }

      parameters.push({
        name,
        value,
        type,
        min,
        max,
        step,
        description,
        lineIndex: i,
        originalLine: lines[i]
      });
    }
  }

  return parameters;
}

export function updateScadParameter(code: string, param: ScadParameter, newValue: string | number | boolean): string {
  const lines = code.split('\n');
  if (param.lineIndex >= 0 && param.lineIndex < lines.length) {
    const line = lines[param.lineIndex];
    let formattedValue = newValue;
    if (param.type === 'string') {
      formattedValue = `"${newValue}"`;
    }
    
    // Replace the value part before the semicolon
    const updatedLine = line.replace(/(=)\s*([^;]+)(;)/, `$1 ${formattedValue}$3`);
    lines[param.lineIndex] = updatedLine;
  }
  return lines.join('\n');
}
