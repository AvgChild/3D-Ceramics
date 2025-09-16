#!/usr/bin/env node

const fs = require('fs').promises;
const https = require('https');
const http = require('http');
const chalk = require('chalk');

class CatalogValidator {
  constructor() {
    this.catalogPath = './catalog/catalog.json';
    this.catalog = [];
    this.errors = [];
    this.warnings = [];
  }

  async init() {
    try {
      const catalogData = await fs.readFile(this.catalogPath, 'utf8');
      this.catalog = JSON.parse(catalogData);
      console.log(chalk.blue(`📋 Loaded catalog with ${this.catalog.length} entries\n`));
    } catch (error) {
      console.error(chalk.red('❌ Failed to load catalog:', error.message));
      process.exit(1);
    }
  }

  async checkUrl(url, description = '') {
    return new Promise((resolve) => {
      const protocol = url.startsWith('https:') ? https : http;
      
      const req = protocol.request(url, { method: 'HEAD' }, (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, status: res.statusCode });
        } else {
          resolve({ success: false, status: res.statusCode, error: `HTTP ${res.statusCode}` });
        }
      });

      req.on('error', (error) => {
        resolve({ success: false, error: error.message });
      });

      req.setTimeout(10000, () => {
        req.destroy();
        resolve({ success: false, error: 'Timeout' });
      });

      req.end();
    });
  }

  validateEntry(entry, index) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!entry.id) errors.push('Missing required field: id');
    if (!entry.title) errors.push('Missing required field: title');
    if (!entry.thumb) errors.push('Missing required field: thumb');
    if (!entry.root) errors.push('Missing required field: root');
    if (!entry.document) errors.push('Missing required field: document');

    // Field types
    if (entry.id && typeof entry.id !== 'string') errors.push('id must be a string');
    if (entry.title && typeof entry.title !== 'string') errors.push('title must be a string');
    if (entry.description && typeof entry.description !== 'string') warnings.push('description should be a string');
    if (entry.tags && !Array.isArray(entry.tags)) warnings.push('tags should be an array');

    // URL validation
    const urlFields = ['thumb', 'root', 'download'];
    urlFields.forEach(field => {
      if (entry[field]) {
        try {
          new URL(entry[field]);
        } catch {
          errors.push(`Invalid URL in ${field}: ${entry[field]}`);
        }
      }
    });

    // Duplicate ID check
    const duplicates = this.catalog.filter(item => item.id === entry.id);
    if (duplicates.length > 1) {
      errors.push(`Duplicate ID found: ${entry.id}`);
    }

    // Document field should typically be scene.svx.json
    if (entry.document && entry.document !== 'scene.svx.json') {
      warnings.push(`Unusual document field: ${entry.document} (expected: scene.svx.json)`);
    }

    return { errors, warnings };
  }

  async validateUrls(entry) {
    const urlChecks = [];
    
    if (entry.thumb) {
      urlChecks.push({
        field: 'thumb',
        url: entry.thumb,
        check: await this.checkUrl(entry.thumb)
      });
    }

    if (entry.root && entry.document) {
      const sceneUrl = entry.root.endsWith('/') ? 
        entry.root + entry.document : 
        entry.root + '/' + entry.document;
      
      urlChecks.push({
        field: 'scene document',
        url: sceneUrl,
        check: await this.checkUrl(sceneUrl)
      });
    }

    if (entry.download) {
      urlChecks.push({
        field: 'download',
        url: entry.download,
        check: await this.checkUrl(entry.download)
      });
    }

    return urlChecks;
  }

  async validate() {
    console.log(chalk.blue('🔍 Validating catalog structure...\n'));

    // Structure validation
    this.catalog.forEach((entry, index) => {
      const validation = this.validateEntry(entry, index);
      
      if (validation.errors.length > 0) {
        this.errors.push({
          entry: entry.title || entry.id || `Entry ${index}`,
          issues: validation.errors
        });
      }

      if (validation.warnings.length > 0) {
        this.warnings.push({
          entry: entry.title || entry.id || `Entry ${index}`,
          issues: validation.warnings
        });
      }
    });

    // URL validation
    console.log(chalk.blue('🌐 Checking URLs (this may take a moment)...\n'));
    
    for (let i = 0; i < this.catalog.length; i++) {
      const entry = this.catalog[i];
      const entryName = entry.title || entry.id || `Entry ${i}`;
      
      process.stdout.write(chalk.gray(`Checking ${entryName}...`));
      
      const urlChecks = await this.validateUrls(entry);
      let hasUrlErrors = false;
      
      for (const check of urlChecks) {
        if (!check.check.success) {
          hasUrlErrors = true;
          this.errors.push({
            entry: entryName,
            issues: [`${check.field} URL failed: ${check.check.error} (${check.url})`]
          });
        }
      }
      
      if (hasUrlErrors) {
        process.stdout.write(chalk.red(' ❌\n'));
      } else {
        process.stdout.write(chalk.green(' ✓\n'));
      }
    }

    // Report results
    this.generateReport();
  }

  generateReport() {
    console.log(chalk.blue('\n📊 Validation Report\n'));

    if (this.errors.length === 0 && this.warnings.length === 0) {
      console.log(chalk.green('🎉 All checks passed! Your catalog is valid.'));
      return;
    }

    // Errors
    if (this.errors.length > 0) {
      console.log(chalk.red(`❌ Found ${this.errors.length} error(s):\n`));
      this.errors.forEach(error => {
        console.log(chalk.red(`${error.entry}:`));
        error.issues.forEach(issue => {
          console.log(chalk.red(`  • ${issue}`));
        });
        console.log();
      });
    }

    // Warnings
    if (this.warnings.length > 0) {
      console.log(chalk.yellow(`⚠️  Found ${this.warnings.length} warning(s):\n`));
      this.warnings.forEach(warning => {
        console.log(chalk.yellow(`${warning.entry}:`));
        warning.issues.forEach(issue => {
          console.log(chalk.yellow(`  • ${issue}`));
        });
        console.log();
      });
    }

    // Summary
    console.log(chalk.blue('Summary:'));
    console.log(chalk.blue(`📋 Total entries: ${this.catalog.length}`));
    console.log(chalk.red(`❌ Errors: ${this.errors.length}`));
    console.log(chalk.yellow(`⚠️  Warnings: ${this.warnings.length}`));

    if (this.errors.length > 0) {
      console.log(chalk.red('\n💡 Please fix the errors before deploying your catalog.'));
      process.exit(1);
    } else {
      console.log(chalk.green('\n✅ No critical errors found. You can deploy your catalog.'));
    }
  }

  async fixCommonIssues() {
    console.log(chalk.blue('🔧 Attempting to fix common issues...\n'));

    let fixed = 0;
    let modified = false;

    this.catalog.forEach(entry => {
      // Fix missing trailing slashes in root URLs
      if (entry.root && !entry.root.endsWith('/') && !entry.root.endsWith('.glb')) {
        entry.root += '/';
        fixed++;
        modified = true;
        console.log(chalk.green(`✓ Fixed root URL for: ${entry.title}`));
      }

      // Convert empty tags to array
      if (entry.tags === '' || entry.tags === null) {
        entry.tags = [];
        fixed++;
        modified = true;
        console.log(chalk.green(`✓ Fixed empty tags for: ${entry.title}`));
      }

      // Ensure tags is an array
      if (entry.tags && typeof entry.tags === 'string') {
        entry.tags = entry.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
        fixed++;
        modified = true;
        console.log(chalk.green(`✓ Converted tags to array for: ${entry.title}`));
      }
    });

    if (modified) {
      await fs.writeFile(this.catalogPath, JSON.stringify(this.catalog, null, 2));
      console.log(chalk.green(`\n🎉 Fixed ${fixed} issues and saved catalog.json`));
    } else {
      console.log(chalk.blue('No common issues found to fix.'));
    }
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');

  const validator = new CatalogValidator();
  await validator.init();

  if (shouldFix) {
    await validator.fixCommonIssues();
    console.log(chalk.blue('\nRe-running validation after fixes...\n'));
  }

  await validator.validate();
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('❌ Error:', error.message));
    process.exit(1);
  });
}

module.exports = CatalogValidator;