function validate(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [source, fields] of Object.entries(schema)) {
      const data = req[source] || {};

      for (const [field, rules] of Object.entries(fields)) {
        const value = data[field];

        // Required
        if (
          rules.required &&
          (
            value === undefined ||
            value === null ||
            value === ''
          )
        ) {
          errors.push({
            source,
            field,
            message: `${field} là bắt buộc.`
          });
          continue;
        }

        // Không bắt buộc và không có dữ liệu
        if (
          value === undefined ||
          value === null ||
          value === ''
        ) {
          continue;
        }

        // String
        if (rules.type === 'string') {
          if (typeof value !== 'string') {
            errors.push({
              source,
              field,
              message: `${field} phải là chuỗi.`
            });
            continue;
          }
        }

        // Integer
        if (rules.type === 'integer') {
          const numberValue = Number(value);

          if (
            typeof value === 'boolean' ||
            value === '' ||
            !Number.isInteger(numberValue)
          ) {
            errors.push({
              source,
              field,
              message: `${field} phải là số nguyên.`
            });
            continue;
          }
        }

        // Number
        if (rules.type === 'number') {
          const numberValue = Number(value);

          if (
            typeof value === 'boolean' ||
            value === '' ||
            !Number.isFinite(numberValue)
          ) {
            errors.push({
              source,
              field,
              message: `${field} phải là số.`
            });
            continue;
          }
        }

        // Boolean
        if (rules.type === 'boolean') {
          if (
            value !== true &&
            value !== false &&
            value !== 'true' &&
            value !== 'false'
          ) {
            errors.push({
              source,
              field,
              message: `${field} phải là boolean.`
            });
            continue;
          }
        }

        // Min
        if (rules.min !== undefined) {
          if (Number(value) < rules.min) {
            errors.push({
              source,
              field,
              message: `${field} phải lớn hơn hoặc bằng ${rules.min}.`
            });
          }
        }

        // Max
        if (rules.max !== undefined) {
          if (Number(value) > rules.max) {
            errors.push({
              source,
              field,
              message: `${field} phải nhỏ hơn hoặc bằng ${rules.max}.`
            });
          }
        }

        // Min length
        if (rules.minLength !== undefined) {
          if (String(value).length < rules.minLength) {
            errors.push({
              source,
              field,
              message: `${field} phải có ít nhất ${rules.minLength} ký tự.`
            });
          }
        }

        // Max length
        if (rules.maxLength !== undefined) {
          if (String(value).length > rules.maxLength) {
            errors.push({
              source,
              field,
              message: `${field} không được vượt quá ${rules.maxLength} ký tự.`
            });
          }
        }

        // Enum
        if (rules.enum && !rules.enum.includes(value)) {
          errors.push({
            source,
            field,
            message: `${field} phải thuộc: ${rules.enum.join(', ')}.`
          });
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Dữ liệu gửi lên không hợp lệ.',
        details: errors
      });
    }

    next();
  };
}

module.exports = {
  validate
};