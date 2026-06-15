export interface Tweet {
	id: string;
	user: string;
	userObj: {
		id: string;
		rest_id: string;
		blue?: boolean;
		favourites_count: number;
		followers_count: number;
		friends_count: number;
		handle?: string;
		displayName?: string;
	};
	likeCount: number;
	retweetCount: number;
	// userAccount?: TwitterUserAccount
	// projectIds: Array<ObjectId>
	deleted: boolean;
	tweetedDate: number;
	createdDate?: number;
	fullText: string;
	entities?: {
		media?: Array<any>;
		user_mentions?: Array<any>;
		mentions?: Array<any>;
		urls?: Array<any>;
		hashtags?: Array<any>;
		symbols?: Array<any>;
	};
	isReply?: boolean;
	replyToTweet?: string;
	replyToUser?: string;
	replyToUserName?: string;
	isQuote?: boolean;
	quotedId?: string;
	isQuoted?: boolean;
	isRt?: boolean;
	retweetedId?: string;
	isLong?: boolean;
	rtId?: string;
	lastLikeId?: string;
	lastRtId?: string;
	lastLikeCheck?: number;
	lastRtCheck?: number;
	// tweeterAuthInfo?: Connection
	credited?: boolean | null;
	// airdropTaskIds?: Array<string>;
	// airdropId?: string; // the last airdrop this tweet is associated with
	// airdropIds?: Array<string>;
	airdropChecked?: number | null;
	sentimentScore?: number | null;
	sentimentError?: string;

	editTweetIds?: Array<string>; // the last one is the latest edit

	views?: {
		count: string;
		state: string;
	};
	votes?: Array<string>;
	// analytics?: TwitterAnalyticData[];
	// searchIds?: Array<string>;
	language?: string;
	addedBy?: string; // process that added the tweet
	pingCount?: number;
	denied: boolean;
	isSearch?: boolean; // if true, the tweet is from a search
	hasViews?: boolean;
	smartInteractions?: Array<string>;
	outlier?: boolean; // if true, the tweet is an outlier for the user (sudden spike in activity)

	// Used for automatic view normalization
	normalizeViews?: boolean;
	lastViewCheck?: number;
	firstViewCheck?: number;

	smartFollowerCount?: number;
	userTags?: Array<string>;
}

export interface TweetForDb extends Tweet {
	// _id?: string;
	updatedDate: number;
	createdDate: number;
	nextUpdateDate?: number; // when to update the tweet next
}
