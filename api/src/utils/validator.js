const validateActivityPayload = (payload) => {
  const errors = [];

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {
      isValid: false,
      errors: ['request body must be a JSON object'],
    };
  }

  // Validate userId (non-empty string)
  if (!payload.userId) {
    errors.push('userId is required');
  } else if (typeof payload.userId !== 'string') {
    errors.push('userId must be a string');
  } else if (payload.userId.trim().length === 0) {
    errors.push('userId cannot be empty');
  }

  // Validate eventType (non-empty string)
  if (!payload.eventType) {
    errors.push('eventType is required');
  } else if (typeof payload.eventType !== 'string') {
    errors.push('eventType must be a string');
  } else if (payload.eventType.trim().length === 0) {
    errors.push('eventType cannot be empty');
  }

  // Validate timestamp (ISO-8601)
  if (!payload.timestamp) {
    errors.push('timestamp is required');
  } else if (typeof payload.timestamp !== 'string') {
    errors.push('timestamp must be a string');
  } else {
    const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;
    if (!iso8601Regex.test(payload.timestamp) || Number.isNaN(Date.parse(payload.timestamp))) {
      errors.push('timestamp must be a valid ISO-8601 string');
    }
  }

  // Validate payload (required JSON object)
  if (payload.payload === undefined) {
    errors.push('payload is required');
  } else if (typeof payload.payload !== 'object' || payload.payload === null || Array.isArray(payload.payload)) {
    errors.push('payload must be a JSON object');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

module.exports = {
  validateActivityPayload,
};
