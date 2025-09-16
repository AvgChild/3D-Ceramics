#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const glob = require('glob');
const chalk = require('chalk');
const ModelUploader = require('./upload-model.js');

class BatchUploader extends ModelUploader {
  async findModelFolders(basePath) {
    const folders = [];
    const items = await fs.readdir(basePath, { withFileTypes: true });
    
    for (const item of items) {
      if (item.isDirectory()) {
        const folderPath = path.join(basePath, item.name);
        const files = await fs.readdir(folderPath);
        
        // Check if folder contains model files
        const hasSceneJson = files.some(f => f.endsWith('scene.svx.json'));
        const hasModel = files.some(f => f.endsWith('.glb') || f.endsWith('.obj'));
        const hasImage = files.some(f => /\.(jpg|jpeg|png)$/i.test(f));
        
        if (hasSceneJson || hasModel || hasImage) {
          folders.push({
            name: item.name,
            path: folderPath,
            files: files.map(f => path.join(folderPath, f))
          });
        }
      }
    }
    
    return folders;
  }

  async processFolder(folder) {
    console.log(chalk.blue(`\n📁 Processing folder: ${folder.name}`));
    
    // Auto-detect files
    const sceneJson = folder.files.find(f => f.endsWith('scene.svx.json'));
    const glbFile = folder.files.find(f => f.endsWith('.glb'));
    const objFile = folder.files.find(f => f.endsWith('.obj'));
    const imageFile = folder.files.find(f => /\.(jpg|jpeg|png)$/i.test(f));
    
    if (!sceneJson && !glbFile) {
      console.log(chalk.yellow(`⚠️  Skipping ${folder.name}: No scene.svx.json or .glb file found`));
      return false;
    }
    
    if (!imageFile) {
      console.log(chalk.yellow(`⚠️  Skipping ${folder.name}: No thumbnail image found`));
      return false;
    }

    try {
      // Extract metadata from folder name or ask user
      const title = folder.name.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      const description = `3D model: ${title}`;
      const tags = this.guessTagsFromName(folder.name);
      
      console.log(chalk.green(`   Title: ${title}`));
      console.log(chalk.green(`   Files found:`));
      if (sceneJson) console.log(chalk.green(`     - Scene: ${path.basename(sceneJson)}`));
      if (glbFile) console.log(chalk.green(`     - GLB: ${path.basename(glbFile)}`));
      if (objFile) console.log(chalk.green(`     - OBJ: ${path.basename(objFile)}`));
      console.log(chalk.green(`     - Image: ${path.basename(imageFile)}`));

      // Upload files
      const folderPath = `${folder.name}/`;
      const cdnBaseUrl = this.config.spaces.cdnUrl || `https://${this.config.spaces.bucket}.${this.config.spaces.endpoint}`;
      
      console.log(chalk.blue('   📤 Uploading...'));
      
      // Upload scene.svx.json
      if (sceneJson) {
        await this.uploadFile(sceneJson, `${folderPath}scene.svx.json`, 'application/json');
      }
      
      // Upload GLB
      if (glbFile) {
        await this.uploadFile(glbFile, `${folderPath}${path.basename(glbFile)}`, 'model/gltf-binary');
      }
      
      // Upload OBJ
      if (objFile) {
        await this.uploadFile(objFile, `${folderPath}${path.basename(objFile)}`, 'model/obj');
      }
      
      // Process and upload thumbnail
      const tempThumb = path.join(__dirname, `../temp_thumbnail_${Date.now()}.jpg`);
      await this.generateThumbnail(imageFile, tempThumb);
      await this.uploadFile(tempThumb, `${folderPath}thumbnail.jpg`, 'image/jpeg');
      await fs.unlink(tempThumb);
      
      // Create catalog entry
      const catalogEntry = {
        id: title,
        title: title,
        description: description,
        tags: tags,
        thumb: `${cdnBaseUrl}/${folderPath}thumbnail.jpg`,
        root: glbFile ? 
          `${cdnBaseUrl}/${folderPath}${path.basename(glbFile)}` : 
          `${cdnBaseUrl}/${folderPath}`,
        document: "scene.svx.json",
        download: objFile ? `${cdnBaseUrl}/${folderPath}${path.basename(objFile)}` : undefined
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
        console.log(chalk.yellow('   ⚠️  Updated existing catalog entry'));
      } else {
        this.catalog.push(catalogEntry);
        console.log(chalk.green('   ✓ Added to catalog'));
      }
      
      return true;
      
    } catch (error) {
      console.error(chalk.red(`   ❌ Failed to process ${folder.name}:`, error.message));
      return false;
    }
  }

  guessTagsFromName(name) {
    const tags = [];
    const lowerName = name.toLowerCase();
    
    // Common ceramic terms
    if (lowerName.includes('bowl')) tags.push('bowl');
    if (lowerName.includes('mug')) tags.push('mug');
    if (lowerName.includes('vase')) tags.push('vase');
    if (lowerName.includes('plate')) tags.push('plate');
    if (lowerName.includes('cup')) tags.push('cup');
    if (lowerName.includes('pottery')) tags.push('pottery');
    if (lowerName.includes('ceramic')) tags.push('ceramic');
    if (lowerName.includes('clay')) tags.push('clay');
    if (lowerName.includes('glaze')) tags.push('glazed');
    if (lowerName.includes('fired')) tags.push('fired');
    if (lowerName.includes('soda')) tags.push('soda fired');
    if (lowerName.includes('ming')) tags.push('ming');
    if (lowerName.includes('dynasty')) tags.push('dynasty');
    if (lowerName.includes('stoneware')) tags.push('stoneware');
    
    return tags.length > 0 ? tags : ['ceramic'];
  }

  async batchUpload(folderPath) {
    console.log(chalk.blue('🔍 Scanning for model folders...\n'));
    
    const folders = await this.findModelFolders(folderPath);
    
    if (folders.length === 0) {
      console.log(chalk.yellow('No model folders found in:', folderPath));
      process.exit(0);
    }
    
    console.log(chalk.green(`Found ${folders.length} potential model folders:`));
    folders.forEach(f => console.log(chalk.blue(`  - ${f.name}`)));
    
    let successful = 0;
    let failed = 0;
    
    for (const folder of folders) {
      const result = await this.processFolder(folder);
      if (result) {
        successful++;
      } else {
        failed++;
      }
    }
    
    // Save updated catalog
    await fs.writeFile(this.config.catalogPath, JSON.stringify(this.catalog, null, 2));
    console.log(chalk.green('\n✓ Updated catalog.json'));
    
    console.log(chalk.blue('\n📊 Batch upload summary:'));
    console.log(chalk.green(`✓ Successful: ${successful}`));
    if (failed > 0) {
      console.log(chalk.red(`❌ Failed: ${failed}`));
    }
    console.log(chalk.blue(`📁 Total catalog entries: ${this.catalog.length}`));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const folderPath = args[0] || './models';
  
  if (!folderPath) {
    console.error(chalk.red('Usage: npm run upload:batch <folder-path>'));
    console.error('Example: npm run upload:batch ./my-models');
    process.exit(1);
  }
  
  try {
    await fs.access(folderPath);
  } catch {
    console.error(chalk.red(`Folder not found: ${folderPath}`));
    process.exit(1);
  }
  
  const uploader = new BatchUploader();
  uploader.config = {
    spaces: {
      endpoint: process.env.DO_SPACES_ENDPOINT || 'nyc3.digitaloceanspaces.com',
      accessKeyId: process.env.DO_SPACES_KEY,
      secretAccessKey: process.env.DO_SPACES_SECRET,
      bucket: process.env.DO_SPACES_BUCKET,
      cdnUrl: process.env.DO_SPACES_CDN_URL
    },
    catalogPath: './catalog/catalog.json'
  };
  
  await uploader.init();
  await uploader.batchUpload(folderPath);
}

if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('❌ Error:', error.message));
    process.exit(1);
  });
}

module.exports = BatchUploader;