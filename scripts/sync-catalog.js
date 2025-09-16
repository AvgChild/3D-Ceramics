#!/usr/bin/env node

const AWS = require('aws-sdk');
const fs = require('fs').promises;
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

class CatalogSyncer {
  constructor() {
    this.catalog = [];
    this.cdnBaseUrl = config.spaces.cdnUrl || `https://${config.spaces.bucket}.${config.spaces.endpoint}`;
  }

  async init() {
    // Validate environment variables
    if (!config.spaces.accessKeyId || !config.spaces.secretAccessKey || !config.spaces.bucket) {
      console.error(chalk.red('❌ Missing required environment variables:'));
      console.error('   DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_BUCKET');
      process.exit(1);
    }

    // Load existing catalog
    try {
      const catalogData = await fs.readFile(config.catalogPath, 'utf8');
      this.catalog = JSON.parse(catalogData);
      console.log(chalk.blue(`📋 Loaded catalog with ${this.catalog.length} entries`));
    } catch (error) {
      console.log(chalk.yellow('⚠️  No existing catalog found, creating new one'));
      this.catalog = [];
    }
  }

  async listSpacesObjects() {
    console.log(chalk.blue('🔍 Scanning DigitalOcean Spaces...'));

    try {
      const params = {
        Bucket: config.spaces.bucket,
        Delimiter: '/'
      };

      const result = await s3.listObjectsV2(params).promise();

      // Get folder prefixes (directories)
      const folders = result.CommonPrefixes?.map(prefix => prefix.Prefix.replace('/', '')) || [];

      console.log(chalk.green(`Found ${folders.length} folders in Spaces:`));
      folders.forEach(folder => console.log(chalk.blue(`  - ${folder}`)));

      return folders;
    } catch (error) {
      console.error(chalk.red('❌ Failed to list Spaces objects:', error.message));
      throw error;
    }
  }

  async getFolderContents(folderName) {
    try {
      const params = {
        Bucket: config.spaces.bucket,
        Prefix: folderName + '/',
        Delimiter: '/'
      };

      const result = await s3.listObjectsV2(params).promise();
      const files = result.Contents?.map(obj => obj.Key) || [];

      return {
        name: folderName,
        files: files,
        hasSceneJson: files.some(f => f.endsWith('scene.svx.json')),
        hasGlb: files.some(f => f.endsWith('.glb')),
        hasObj: files.some(f => f.endsWith('.obj')),
        hasThumbnail: files.some(f => f.endsWith('thumbnail.jpg') || f.endsWith('thumbnail.png')),
        glbFile: files.find(f => f.endsWith('.glb')),
        objFile: files.find(f => f.endsWith('.obj')),
        thumbnailFile: files.find(f => f.includes('thumbnail'))
      };
    } catch (error) {
      console.error(chalk.red(`❌ Failed to get contents for ${folderName}:`, error.message));
      return null;
    }
  }

  createCatalogEntry(folder) {
    // Generate title from folder name
    const title = folder.name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    // Generate description and tags
    const description = this.generateDescription(folder.name);
    const tags = this.generateTags(folder.name);

    // Build URLs
    const root = `${this.cdnBaseUrl}/${folder.name}/`;
    const thumb = folder.thumbnailFile ? `${this.cdnBaseUrl}/${folder.thumbnailFile}` : '';
    const download = folder.objFile ? `${this.cdnBaseUrl}/${folder.objFile}` : undefined;

    const entry = {
      id: title,
      title: title,
      description: description,
      tags: tags,
      thumb: thumb,
      root: root,
      document: "scene.svx.json"
    };

    if (download) {
      entry.download = download;
    }

    return entry;
  }

  generateDescription(folderName) {
    const name = folderName.toLowerCase();

    if (name.includes('bowl')) return 'Ceramic bowl with unique glazing and firing techniques';
    if (name.includes('vase')) return 'Elegant ceramic vase showcasing traditional craftsmanship';
    if (name.includes('mug')) return 'Handcrafted ceramic mug with artistic glazing';
    if (name.includes('ming') || name.includes('dynasty')) return 'Historical ceramic piece from ancient traditions';
    if (name.includes('funeral')) return 'Ceremonial ceramic vessel with cultural significance';

    return `Handcrafted ceramic piece: ${folderName.replace(/[-_]/g, ' ')}`;
  }

  generateTags(folderName) {
    const tags = [];
    const name = folderName.toLowerCase();

    // Object types
    if (name.includes('bowl')) tags.push('Bowl');
    if (name.includes('vase')) tags.push('Vase');
    if (name.includes('mug')) tags.push('Mug');
    if (name.includes('cup')) tags.push('Cup');
    if (name.includes('plate')) tags.push('Plate');

    // Techniques and materials
    if (name.includes('soda')) tags.push('Soda');
    if (name.includes('fired')) tags.push('Fired');
    if (name.includes('glaze')) tags.push('Glazed');
    if (name.includes('ceramic')) tags.push('Ceramic');
    if (name.includes('stoneware')) tags.push('Stoneware');
    if (name.includes('pottery')) tags.push('Pottery');

    // Historical/Cultural
    if (name.includes('ming')) tags.push('Ming');
    if (name.includes('dynasty')) tags.push('Dynasty');
    if (name.includes('funeral')) tags.push('Funeral');
    if (name.includes('ritual')) tags.push('Ritual');

    // Artists/Makers (extract from folder names)
    const nameParts = folderName.split(/[-_\s]/);
    nameParts.forEach(part => {
      if (part.length > 2 && /^[A-Z]/.test(part)) {
        tags.push(part);
      }
    });

    return tags.length > 0 ? tags : ['Ceramic'];
  }

  async syncCatalog() {
    console.log(chalk.blue('\n🔄 Starting catalog sync...\n'));

    const folders = await this.listSpacesObjects();
    let newEntries = 0;
    let updatedEntries = 0;
    let skippedEntries = 0;

    for (const folderName of folders) {
      console.log(chalk.blue(`\n📁 Processing: ${folderName}`));

      const folderContents = await this.getFolderContents(folderName);

      if (!folderContents) {
        console.log(chalk.red(`   ❌ Could not access folder contents`));
        skippedEntries++;
        continue;
      }

      // Check if it's a valid model folder
      if (!folderContents.hasSceneJson && !folderContents.hasGlb) {
        console.log(chalk.yellow(`   ⚠️  Skipping: No scene.svx.json or .glb file found`));
        skippedEntries++;
        continue;
      }

      if (!folderContents.hasThumbnail) {
        console.log(chalk.yellow(`   ⚠️  Skipping: No thumbnail found`));
        skippedEntries++;
        continue;
      }

      // Create catalog entry
      const newEntry = this.createCatalogEntry(folderContents);

      // Check if entry already exists
      const existingIndex = this.catalog.findIndex(item =>
        item.id === newEntry.id ||
        item.title === newEntry.title ||
        item.root.includes(folderName)
      );

      if (existingIndex >= 0) {
        // Update existing entry
        this.catalog[existingIndex] = newEntry;
        console.log(chalk.yellow(`   ✓ Updated existing entry: ${newEntry.title}`));
        updatedEntries++;
      } else {
        // Add new entry
        this.catalog.push(newEntry);
        console.log(chalk.green(`   ✓ Added new entry: ${newEntry.title}`));
        newEntries++;
      }

      console.log(chalk.gray(`     Files: ${folderContents.files.length} items`));
      console.log(chalk.gray(`     Tags: ${newEntry.tags.join(', ')}`));
    }

    // Save updated catalog
    await fs.writeFile(config.catalogPath, JSON.stringify(this.catalog, null, 2));

    console.log(chalk.green('\n✅ Catalog sync completed!'));
    console.log(chalk.blue('\n📊 Sync Summary:'));
    console.log(chalk.green(`   ✓ New entries: ${newEntries}`));
    console.log(chalk.yellow(`   ↻ Updated entries: ${updatedEntries}`));
    console.log(chalk.gray(`   ⏭  Skipped folders: ${skippedEntries}`));
    console.log(chalk.blue(`   📋 Total catalog entries: ${this.catalog.length}`));

    if (newEntries > 0 || updatedEntries > 0) {
      console.log(chalk.green('\n💾 Catalog saved to:', config.catalogPath));
    }
  }
}

// Main execution
async function main() {
  const syncer = new CatalogSyncer();
  await syncer.init();
  await syncer.syncCatalog();
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('❌ Error:', error.message));
    process.exit(1);
  });
}

module.exports = CatalogSyncer;