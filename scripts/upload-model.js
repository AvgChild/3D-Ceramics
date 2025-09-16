#!/usr/bin/env node

const AWS = require('aws-sdk');
const fs = require('fs').promises;
const path = require('path');
const inquirer = require('inquirer');
const sharp = require('sharp');
const mime = require('mime-types');
const chalk = require('chalk');
require('dotenv').config();

// Configuration
const config = {
  spaces: {
    endpoint: process.env.DO_SPACES_ENDPOINT || 'nyc3.digitaloceanspaces.com',
    accessKeyId: process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
    bucket: process.env.DO_SPACES_BUCKET,
    cdnUrl: process.env.DO_SPACES_CDN_URL
  },
  catalogPath: './catalog/catalog.json'
};

// Initialize DigitalOcean Spaces client
const spacesEndpoint = new AWS.Endpoint(config.spaces.endpoint);
const s3 = new AWS.S3({
  endpoint: spacesEndpoint,
  accessKeyId: config.spaces.accessKeyId,
  secretAccessKey: config.spaces.secretAccessKey
});

class ModelUploader {
  constructor() {
    this.catalog = [];
  }

  async init() {
    // Validate environment variables
    if (!config.spaces.accessKeyId || !config.spaces.secretAccessKey || !config.spaces.bucket) {
      console.error(chalk.red('❌ Missing required environment variables:'));
      console.error('   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET');
      console.error('   Create a .env file with these values');
      process.exit(1);
    }

    // Load existing catalog
    try {
      const catalogData = await fs.readFile(config.catalogPath, 'utf8');
      this.catalog = JSON.parse(catalogData);
    } catch (error) {
      console.log(chalk.yellow('⚠️  No existing catalog found, creating new one'));
      this.catalog = [];
    }
  }

  async uploadFile(filePath, key, contentType) {
    const fileContent = await fs.readFile(filePath);
    
    const params = {
      Bucket: config.spaces.bucket,
      Key: key,
      Body: fileContent,
      ContentType: contentType,
      ACL: 'public-read'
    };

    try {
      const result = await s3.upload(params).promise();
      console.log(chalk.green(`✓ Uploaded: ${key}`));
      return result.Location;
    } catch (error) {
      console.error(chalk.red(`❌ Failed to upload ${key}:`, error.message));
      throw error;
    }
  }

  async generateThumbnail(imagePath, outputPath) {
    try {
      await sharp(imagePath)
        .resize(400, 400, { 
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 85 })
        .toFile(outputPath);
      
      console.log(chalk.green('✓ Generated thumbnail'));
      return outputPath;
    } catch (error) {
      console.error(chalk.red('❌ Failed to generate thumbnail:', error.message));
      throw error;
    }
  }

  async promptForDetails() {
    const questions = [
      {
        type: 'input',
        name: 'title',
        message: 'Model title:',
        validate: (input) => input.length > 0 || 'Title is required'
      },
      {
        type: 'input',
        name: 'description',
        message: 'Description:'
      },
      {
        type: 'input',
        name: 'tags',
        message: 'Tags (comma-separated):',
        filter: (input) => input.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
      },
      {
        type: 'input',
        name: 'folderName',
        message: 'Folder name for this model:',
        default: (answers) => answers.title.replace(/[^a-zA-Z0-9]/g, ''),
        validate: (input) => input.length > 0 || 'Folder name is required'
      }
    ];

    return await inquirer.prompt(questions);
  }

  async promptForFiles() {
    const questions = [
      {
        type: 'input',
        name: 'sceneJson',
        message: 'Path to scene.svx.json file:',
        validate: async (input) => {
          try {
            await fs.access(input);
            return true;
          } catch {
            return 'File not found';
          }
        }
      },
      {
        type: 'input',
        name: 'glbFile',
        message: 'Path to .glb model file (optional):',
        validate: async (input) => {
          if (!input) return true;
          try {
            await fs.access(input);
            return true;
          } catch {
            return 'File not found';
          }
        }
      },
      {
        type: 'input',
        name: 'objFile',
        message: 'Path to .obj file for download (optional):',
        validate: async (input) => {
          if (!input) return true;
          try {
            await fs.access(input);
            return true;
          } catch {
            return 'File not found';
          }
        }
      },
      {
        type: 'input',
        name: 'thumbnail',
        message: 'Path to thumbnail image:',
        validate: async (input) => {
          try {
            await fs.access(input);
            return true;
          } catch {
            return 'File not found';
          }
        }
      }
    ];

    return await inquirer.prompt(questions);
  }

  async uploadModel() {
    console.log(chalk.blue('🚀 Clay Archive Model Uploader\n'));

    const details = await this.promptForDetails();
    const files = await this.promptForFiles();
    
    const folderPath = `${details.folderName}/`;
    const cdnBaseUrl = config.spaces.cdnUrl || `https://${config.spaces.bucket}.${config.spaces.endpoint}`;
    const urls = {};

    console.log(chalk.blue('\n📤 Starting upload...'));

    try {
      // Upload scene.svx.json
      urls.sceneJson = await this.uploadFile(
        files.sceneJson,
        `${folderPath}scene.svx.json`,
        'application/json'
      );

      // Upload GLB file if provided
      if (files.glbFile) {
        const glbName = path.basename(files.glbFile);
        urls.glb = await this.uploadFile(
          files.glbFile,
          `${folderPath}${glbName}`,
          'model/gltf-binary'
        );
      }

      // Upload OBJ file if provided
      if (files.objFile) {
        const objName = path.basename(files.objFile);
        urls.obj = await this.uploadFile(
          files.objFile,
          `${folderPath}${objName}`,
          'model/obj'
        );
      }

      // Process and upload thumbnail
      const tempThumb = path.join(__dirname, '../temp_thumbnail.jpg');
      await this.generateThumbnail(files.thumbnail, tempThumb);
      
      urls.thumbnail = await this.uploadFile(
        tempThumb,
        `${folderPath}thumbnail.jpg`,
        'image/jpeg'
      );

      // Clean up temp file
      await fs.unlink(tempThumb);

      // Create catalog entry
      const catalogEntry = {
        id: details.folderName,
        title: details.title,
        description: details.description,
        tags: details.tags,
        thumb: `${cdnBaseUrl}/${folderPath}thumbnail.jpg`,
        root: files.glbFile ? 
          `${cdnBaseUrl}/${folderPath}${path.basename(files.glbFile)}` : 
          `${cdnBaseUrl}/${folderPath}`,
        document: "scene.svx.json",
        download: files.objFile ? `${cdnBaseUrl}/${folderPath}${path.basename(files.objFile)}` : undefined
      };

      // Remove undefined properties
      Object.keys(catalogEntry).forEach(key => {
        if (catalogEntry[key] === undefined) {
          delete catalogEntry[key];
        }
      });

      // Add to catalog
      const existingIndex = this.catalog.findIndex(item => item.id === catalogEntry.id);
      if (existingIndex >= 0) {
        this.catalog[existingIndex] = catalogEntry;
        console.log(chalk.yellow('⚠️  Updated existing catalog entry'));
      } else {
        this.catalog.push(catalogEntry);
        console.log(chalk.green('✓ Added new catalog entry'));
      }

      // Save catalog
      await fs.writeFile(config.catalogPath, JSON.stringify(this.catalog, null, 2));
      console.log(chalk.green('✓ Updated catalog.json'));

      console.log(chalk.green('\n🎉 Upload completed successfully!'));
      console.log(chalk.blue('📋 Catalog entry:'));
      console.log(JSON.stringify(catalogEntry, null, 2));

    } catch (error) {
      console.error(chalk.red('\n❌ Upload failed:', error.message));
      process.exit(1);
    }
  }
}

// Main execution
async function main() {
  const uploader = new ModelUploader();
  await uploader.init();
  await uploader.uploadModel();
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('❌ Error:', error.message));
    process.exit(1);
  });
}

module.exports = ModelUploader;