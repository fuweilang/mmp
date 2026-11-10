import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
export class AdminLibraryQuery {
 @IsOptional() @IsString() @MaxLength(180) q?: string;
 @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
 @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
 @IsOptional() @IsIn(['ACTIVE','RECYCLED']) state?: 'ACTIVE' | 'RECYCLED';
 @IsOptional() @IsIn(['PRIVATE','ENTERPRISE']) scope?: 'PRIVATE' | 'ENTERPRISE';
 @IsOptional() @IsString() ownerUserId?: string;
 @IsOptional() @IsString() folderId?: string;
 @IsOptional() @IsIn(['folder','link','image','video','pdf','word','excel','ppt','text','other']) fileType?: string;
 @IsOptional() @IsIn(['PENDING','PROCESSING','READY','FAILED','DOWNLOAD_ONLY','NOT_APPLICABLE']) status?: string;
}
export class AdminLibraryContext {
 @IsString() @MinLength(1) grantId!: string;
 @IsString() @MinLength(8) @MaxLength(100) requestId!: string;
 @IsString() @MinLength(4) @MaxLength(500) reason!: string;
}
export class AdminLibraryScopeImpactQuery {
 @IsString() @MinLength(1) grantId!: string;
 @IsString() @MinLength(1) targetGrantId!: string;
 @IsIn(['PRIVATE','ENTERPRISE']) scope!: 'PRIVATE' | 'ENTERPRISE';
}
export class AdminLibraryCreate extends AdminLibraryContext {
 @IsString() @MinLength(1) ownerUserId!: string;
 @IsIn(['PRIVATE','ENTERPRISE']) scope!: 'PRIVATE' | 'ENTERPRISE';
 @IsOptional() @IsString() parentId?: string;
 @IsOptional() @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() confirmShare?: boolean;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(180) name?: string;
}
export class AdminLibraryCommand extends AdminLibraryContext {
 @IsString() @MinLength(1) nodeId!: string;
 @IsIn(['rename','move','scope','recycle','restore','purge','retry','replace']) action!: 'rename'|'move'|'scope'|'recycle'|'restore'|'purge'|'retry'|'replace';
 @IsISO8601() expectedUpdatedAt!: string;
 @IsOptional() @IsString() expectedVersionId?: string;
 @IsOptional() @IsString() @MinLength(1) @MaxLength(180) name?: string;
 @IsOptional() @IsString() parentId?: string;
 @IsOptional() @IsIn(['PRIVATE','ENTERPRISE']) scope?: 'PRIVATE' | 'ENTERPRISE';
 @IsOptional() @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() confirmShare?: boolean;
 @IsOptional() @IsString() targetGrantId?: string;
 @IsOptional() @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() confirmUnshare?: boolean;
 @IsOptional() @IsString() @MaxLength(64) expectedTreeRevision?: string;
 @IsOptional() @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() confirmPurge?: boolean;
 @IsOptional() @Transform(({ value }: { value: unknown }) => value === 'true' ? true : value === 'false' ? false : value) @IsBoolean() confirmMissingParent?: boolean;
}
