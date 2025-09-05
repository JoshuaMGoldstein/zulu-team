import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

export class GCSUtil {
  private projectId: string;
  private logCache: Map<string, string> = new Map();
  private MAX_CACHE_SIZE = 100; // Maximum number of log files to cache

  constructor(projectId?: string) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID || '';
    if (!this.projectId) {
      throw new Error('GCP_PROJECT_ID not set in environment variables');
    }
  }

  private getFromCache(key: string): string | undefined {
    const cached = this.logCache.get(key);
    if (cached) {
      // Move to front to mark as recently used
      this.logCache.delete(key);
      this.logCache.set(key, cached);
    }
    return cached;
  }

  private setToCache(key: string, value: string): void {
    if (this.logCache.has(key)) {
      this.logCache.delete(key);
    } else if (this.logCache.size >= this.MAX_CACHE_SIZE) {
      // Remove LRU item
      const lruKey = this.logCache.keys().next().value;
      if (lruKey !== undefined) {
        this.logCache.delete(lruKey);
      }
    }
    this.logCache.set(key, value);
  }

  /**
   * Upload data to GCS using pipe capability
   * @param data The data to upload
   * @param bucketName The GCS bucket name
   * @param objectPath The path within the bucket
   */
  async uploadData(data: string, bucketName: string, objectPath: string): Promise<void> {
    const fullPath = `gs://${bucketName}/${objectPath}`;
    
    try {
      // Use echo to pipe data to gcloud storage cp
      const command = `echo '${this.escapeShellArg(data)}' | gcloud storage cp - "${fullPath}"`;
      await execAsync(command);
      console.log(`✅ Uploaded data to ${fullPath}`);
    } catch (error) {
      console.error(`Error uploading to ${fullPath}:`, error);
      throw error;
    }
  }

  /**
   * Append data to an existing GCS object.
   * Downloads the existing content, appends new data, and re-uploads.
   * @param data The data to append
   * @param bucketName The GCS bucket name
   * @param objectPath The path within the bucket
   */
  async appendData(data: string, bucketName: string, objectPath: string): Promise<void> {
    const fullPath = `gs://${bucketName}/${objectPath}`;
    let existingContent = this.getFromCache(fullPath);

    if (existingContent === undefined) { // Not in cache, check GCS
      if (await this.objectExists(bucketName, objectPath)) {
        try {
          existingContent = await this.downloadData(bucketName, objectPath);
        } catch (error) {
          console.error(`Error downloading existing content from ${fullPath}:`, error);
          existingContent = ''; // Continue with empty content if download fails for an existing file
        }
      } else {
        console.log(`Object ${fullPath} does not exist, creating new file.`);
        existingContent = '';
      }
    }

    const combinedData = existingContent + data;

    try {
      const command = `echo '${this.escapeShellArg(combinedData)}' | gcloud storage cp - "${fullPath}"`;
      await execAsync(command);
      console.log(`✅ Appended data to ${fullPath}`);
      this.setToCache(fullPath, combinedData); // Update cache after successful append
    } catch (error) {
      console.error(`Error appending to ${fullPath}:`, error);
      throw error;
    }
  }

  /**
   * Download data from GCS
   * @param bucketName The GCS bucket name
   * @param objectPath The path within the bucket
   * @returns The downloaded data as string
   */
  async downloadData(bucketName: string, objectPath: string): Promise<string> {
    const fullPath = `gs://${bucketName}/${objectPath}`;
    
    try {
      const { stdout } = await execAsync(`gcloud storage cat "${fullPath}"`);
      return stdout;
    } catch (error) {
      console.error(`Error downloading from ${fullPath}:`, error);
      throw error;
    }
  }

  /**
   * Check if an object exists in GCS
   * @param bucketName The GCS bucket name
   * @param objectPath The path within the bucket
   * @returns true if the object exists
   */
  async objectExists(bucketName: string, objectPath: string): Promise<boolean> {
    const fullPath = `gs://${bucketName}/${objectPath}`;
    
    try {
      await execAsync(`gcloud storage stat "${fullPath}"`);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * List objects in a GCS bucket
   * @param bucketName The GCS bucket name
   * @param prefix Optional prefix to filter objects
   * @returns Array of object paths
   */
  async listObjects(bucketName: string, prefix?: string): Promise<string[]> {
    const fullPath = `gs://${bucketName}${prefix ? '/' + prefix : ''}`;
    
    try {
      const { stdout } = await execAsync(`gcloud storage ls "${fullPath}"`);
      return stdout.trim().split('\n').filter(line => line.trim());
    } catch (error) {
      console.error(`Error listing objects in ${fullPath}:`, error);
      return [];
    }
  }

  /**
   * Create a new GCS bucket
   * @param bucketName The name of the bucket to create
   */
  async createBucket(bucketName: string): Promise<void> {
    try {
      await execAsync(`gcloud storage buckets create gs://${bucketName} --project=${this.projectId}`);
      console.log(`✅ Created bucket gs://${bucketName}`);
    } catch (error) {
      console.error(`Error creating bucket ${bucketName}:`, error);
      throw error;
    }
  }

  /**
   * Delete a GCS bucket
   * @param bucketName The name of the bucket to delete
   */
  async deleteBucket(bucketName: string): Promise<void> {
    try {
      // First, delete all objects in the bucket
      await execAsync(`gcloud storage rm -r gs://${bucketName}/* --project=${this.projectId} --quiet`);
      console.log(`✅ Deleted all objects in gs://${bucketName}`);
      
      // Then, delete the bucket itself
      await execAsync(`gcloud storage buckets delete gs://${bucketName} --project=${this.projectId} --quiet`);
      console.log(`✅ Deleted bucket gs://${bucketName}`);
    } catch (error) {
      console.error(`Error deleting bucket ${bucketName}:`, error);
      throw error;
    }
  }

  /**
   * Add IAM policy binding to a bucket
   * @param bucketName The GCS bucket name
   * @param member The member to add (e.g., serviceAccount:email@domain.com)
   * @param role The role to assign
   */
  async addBucketIamPolicy(bucketName: string, member: string, role: string): Promise<void> {
    try {
      await execAsync(`gcloud storage buckets add-iam-policy-binding gs://${bucketName} --member=${member} --role=${role}`);
      console.log(`✅ Added IAM policy: ${member} -> ${role} for gs://${bucketName}`);
    } catch (error) {
      console.error(`Error adding IAM policy to ${bucketName}:`, error);
      throw error;
    }
  }

  /**
   * Create a service account
   * @param serviceAccountName The name of the service account
   * @param displayName The display name for the service account
   */
  async createServiceAccount(serviceAccountName: string, displayName: string): Promise<string> {
    try {
      await execAsync(`gcloud iam service-accounts create ${serviceAccountName} --project=${this.projectId} --display-name="${displayName}"`);
      const email = `${serviceAccountName}@${this.projectId}.iam.gserviceaccount.com`;
      console.log(`✅ Created service account ${email}`);
      return email;
    } catch (error) {
      console.error(`Error creating service account ${serviceAccountName}:`, error);
      throw error;
    }
  }

  /**
   * Create a service account key and return the key data
   * @param serviceAccountEmail The email of the service account
   * @returns The key data as parsed JSON object
   */
  async createServiceAccountKey(serviceAccountEmail: string): Promise<any> {
    const keyFilePath = `/tmp/${Math.random().toString(36).substring(2, 15)}.json`;
    
    try {
      await execAsync(`gcloud iam service-accounts keys create ${keyFilePath} --iam-account=${serviceAccountEmail}`);
      
      // Read and parse the key file
      const keyContent = fs.readFileSync(keyFilePath, 'utf8');
      const keyData = JSON.parse(keyContent);
      
      console.log(`✅ Created service account key for ${serviceAccountEmail}`);
      return keyData;
    } catch (error) {
      console.error(`Error creating service account key for ${serviceAccountEmail}:`, error);
      throw error;
    } finally {
      // Clean up the temporary file
      if (fs.existsSync(keyFilePath)) {
        fs.unlinkSync(keyFilePath);
      }
    }
  }

  /**
   * Delete a service account
   * @param serviceAccountEmail The email of the service account to delete
   */
  async deleteServiceAccount(serviceAccountEmail: string): Promise<void> {
    try {
      await execAsync(`gcloud iam service-accounts --quiet delete ${serviceAccountEmail}`);
      console.log(`✅ Deleted service account ${serviceAccountEmail}`);
    } catch (error) {
      console.error(`Error deleting service account ${serviceAccountEmail}:`, error);
      throw error;
    }
  }

  /**
   * Escape shell arguments to prevent injection
   */
  private escapeShellArg(arg: string): string {
    return arg.replace(/'/g, "'\"'\"'");
  }
}

export default new GCSUtil();