-- Supabase Authentication Schema for Zulu Team
-- This schema supports multi-tenant accounts with user authentication

-- Drop tables if they exist (order matters due to foreign key constraints)
DROP TABLE IF EXISTS invitations CASCADE;
DROP TABLE IF EXISTS models CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS presets CASCADE;
DROP TABLE IF EXISTS git_keys CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS bot_instances CASCADE;
DROP TABLE IF EXISTS account_users CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Accounts table - top-level organization/tenant
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    settings JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE
);

-- Users table - individual users who can belong to multiple accounts
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT auth.uid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    provider VARCHAR(50) NOT NULL, -- 'google', 'discord', 'slack'
    provider_id VARCHAR(255) NOT NULL, -- ID from the provider
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(provider, provider_id)
);

-- Account-User relationship table with roles
CREATE TABLE account_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'dev', 'botuser')),
    invited_by UUID,
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE,
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(account_id, user_id),
    CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_invited_by FOREIGN KEY (invited_by) REFERENCES users(id)
);

-- Bot instances table (replaces bot-instances/*.json)
CREATE TABLE bot_instances (
    id VARCHAR(255) PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'stopped',
    config JSONB DEFAULT '{}',
    env JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, id)
);

-- Projects table (replaces projects.json)
CREATE TABLE projects (
    id VARCHAR(255) PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    repository_url TEXT,
    branch VARCHAR(255) DEFAULT 'main',
    git_key_id VARCHAR(255),
    account_id_ref VARCHAR(255), -- Reference to account-specific git key
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, name)
);

-- Git keys table (replaces gitkeys.json)
CREATE TABLE git_keys (
    id VARCHAR(255) PRIMARY KEY,
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    public_key TEXT,
    private_key TEXT, -- Encrypted at rest
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, id)
);

-- Presets table (system-wide presets)
CREATE TABLE presets (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    preset VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Settings table (replaces settings.json)
CREATE TABLE settings (
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    key VARCHAR(255) NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (account_id, key)
);


-- Models table (system-wide models)
CREATE TABLE models (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    max_tokens INTEGER NOT NULL,
    temperature DECIMAL(3,2) DEFAULT 0.7,
    top_p DECIMAL(3,2) DEFAULT 1.0,
    frequency_penalty DECIMAL(3,2) DEFAULT 0.0,
    presence_penalty DECIMAL(3,2) DEFAULT 0.0,
    supported_parameters INTEGER NOT NULL, -- Bitfield for parameter support
    cost_per_1k_tokens DECIMAL(10,6) DEFAULT 0.0,
    context_window INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invitations table for account invitations
CREATE TABLE invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'dev', 'botuser')),
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(account_id, email)
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_provider ON users(provider, provider_id);
CREATE INDEX idx_account_users_account ON account_users(account_id);
CREATE INDEX idx_account_users_user ON account_users(user_id);
CREATE INDEX idx_bot_instances_account ON bot_instances(account_id);
CREATE INDEX idx_projects_account ON projects(account_id);
CREATE INDEX idx_git_keys_account ON git_keys(account_id);
CREATE INDEX idx_settings_account ON settings(account_id);
CREATE INDEX idx_invitations_account ON invitations(account_id);
CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_email ON invitations(email);

-- Create default account
INSERT INTO accounts (id, name, created_at, updated_at) VALUES 
('00000000-0000-0000-0000-000000000000', 'default', NOW(), NOW());

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers to all tables
CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_account_users_updated_at BEFORE UPDATE ON account_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_instances_updated_at BEFORE UPDATE ON bot_instances
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_git_keys_updated_at BEFORE UPDATE ON git_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_presets_updated_at BEFORE UPDATE ON presets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_models_updated_at BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invitations_updated_at BEFORE UPDATE ON invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Setup



-- Enable RLS for accounts
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to create accounts" ON accounts
FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "Users can view their own account" ON accounts
FOR SELECT USING (EXISTS (SELECT 1 FROM account_users WHERE account_id = accounts.id AND user_id = auth.uid()));


-- Enable RLS for users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own user record" ON users
FOR SELECT USING (id = auth.uid());

-- Enable RLS for account_users
ALTER TABLE account_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users to link to their new account" ON account_users
FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() AND account_id = auth.uid());
CREATE POLICY "Users can view their account_user records" ON account_users
FOR SELECT USING (EXISTS (SELECT 1 FROM account_users au2 WHERE au2.account_id = account_users.account_id AND au2.user_id = auth.uid()));
-- CREATE POLICY "Admins can manage account_user records" ON account_users
-- FOR UPDATE USING (account_id = get_user_account_id() AND public.is_account_admin(account_id));
-- CREATE POLICY "Admins can delete account_user records" ON account_users
-- FOR DELETE USING (account_id = get_user_account_id() AND public.is_account_admin(account_id));

-- Enable RLS for bot_instances
ALTER TABLE bot_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their bot instances" ON bot_instances
FOR ALL USING (account_id = get_user_account_id());

-- Enable RLS for projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their projects" ON projects
FOR ALL USING (account_id = get_user_account_id());

-- Enable RLS for git_keys
ALTER TABLE git_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their git keys" ON git_keys
FOR ALL USING (account_id = get_user_account_id());

-- Enable RLS for settings
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their settings" ON settings
FOR ALL USING (account_id = get_user_account_id());

-- Enable RLS for invitations
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Invited users can view their invitations" ON invitations
FOR SELECT USING (email = auth.email());

CREATE POLICY "Admins can manage invitations for their account" ON invitations
FOR ALL USING (EXISTS (SELECT 1 FROM account_users WHERE account_id = get_user_account_id() AND user_id = auth.uid() AND role = 'admin'));