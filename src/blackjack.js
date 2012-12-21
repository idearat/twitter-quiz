/**
* @fileoverview Implements a standard blackjack game.
*
* NOTE that the implementation here attempts to both solve the stated challenge
* and use a variety of techniques and approaches for skill assessment purposes.
*
* @author Scott Shattuck (ss)
*/

/*jslint anon:true, nomen:true, plusplus:true */
/*globals d3, $, StateMachine */

(function(root) {

'use strict';

//  --------------------------------------------------------------------------- 
//	Setup
//  --------------------------------------------------------------------------- 

var B,			// The global namespace for our game components.
	DEBUG;		// Debugging state flag. Set via http://{path}/#debug.


/**
 * The global namespace object for our game. This object is the only one
 * exported directly. All testable objects are attached to the namespace.
 * @type {Object}
 */
B = {};


/**
 * Flag for turning on debugging output to the Javascript console. This flag is
 * set onload by checking the application URL for #debug or &debug=true.
 * Note that normally we wouldn't use all caps for a non-constant value, but we
 * want DEBUG to stand out in code.
 * @type {boolean}
 */
DEBUG = false;


// Trap uncaught exceptions that might try to slip past us.
if (window) {
	window.onerror = function(msg, url, line) {
		log('ERROR @ ' + url + '[' + (line || 0) + '] - ' + msg);
		return true;
	};
}


/*
 * Log to both the JavaScript console and to the application status bar. Logging
 * to the application's web UI assumes an element with an ID of #log.
 * @param {String} msg The message to log.
 */
function log(msg) {
	var elem;

	console.log(msg);
	elem = $('#log');
	if (elem) {
		elem.html(msg);
	}
}

//  --------------------------------------------------------------------------- 
//  Printable Mixin
//  --------------------------------------------------------------------------- 

/**
 * A simple mixin for card-printing support. Leveraged by Hand, Deck, and Shoe.
 *
 * Note that consumers of the mixin must implement a getCards method returning
 * an Array of B.Card instances.
 */
B.Printable = {

	/**
	 * Prints the cards of the receiver via the Card print method.
	 * @return {B.Printable} The receiver.
	 */
	print: function() {
		var cards,
			arr;

		arr = [];
		cards = this.getCards();
		cards.map(function(card) {
			arr.push(card.print());
		});

		// Use a space here. Commas make Card values/suits harder to read.
		return arr.join(' ');
	}
};

//  --------------------------------------------------------------------------- 
//  Shuffler Mixin
//  --------------------------------------------------------------------------- 

/*
 * The Shuffler mixin is used as a simple way to factor a common shuffle
 * routine out of Deck and Shoe to allow them to share it without inheritance.
 *
 * Consumers of the mixin must implement a getCards() method which returns an
 * array and must manage the shuffled property to ensure it is false whenever
 * they dirty their card array.
 */


/**
 * A simple mixin for common shuffling algorithm support. The shuffling
 * algorithm here is a Fisher-Yates shuffle.
 * See http://bost.ocks.org/mike/shuffle for a live example and discussion.
 */
B.Shuffler = {

	/**
	 * A flag denoting whether the card collection is currently sorted.
     * @type {boolean}
	 */
	shuffled: false,


	/**
	 * Shuffles the card collection to produce a random card order.
	 * @return {B.Shuffler} The receiver.
	 */
	shuffle: function() {
		var cards,
			m,
			t,
			i,
			start,
			end;

		// Dependency created on the consumer to dirty shuffled as needed.
		if (this.shuffled) {
			return this;
		}

		// Dependency created here on the consumer to implement getCards.
		cards = this.getCards();
		m = cards.length;

		if (DEBUG) {
			start = (new Date()).getTime();
		}

		// Shuffle in place.
		while (m) {
			i = Math.floor(Math.random() * m--);
			t = cards[m];
			cards[m] = cards[i];
			cards[i] = t;
		}

		this.shuffled = true;

		if (DEBUG) {
			end = (new Date()).getTime();
			log('Shuffled fresh shoe of ' + cards.length + ' cards in ' +
				(end - start) + 'ms.');
		}

		return this;
	}
};

//  --------------------------------------------------------------------------- 
//  Cards / Decks / Shoes
//  --------------------------------------------------------------------------- 

/*
 * NOTE: The Card object is implemented as a largely encapsulated constructor
 * which has the benefit of making Card values read-only (you can't change
 * the value of a card) at the expense of additional overhead due to each card
 * having its own getter functions. To avoid truly excessive overhead the label
 * and symbol lookup tables are external to the instance. This does make it
 * possible for a card to report incorrect label/symbol information if one were
 * to alter these more exposed lookup tables or the methods which access them.
 * The internal card index values remain unchanged in any event.
 */


/**
 * Constructs a new Card instance and returns it. Normally Card instances are
 * not created directly but are produced from within the context of a Deck.
 * @param {number} i The card index from 1 to 13 (Ace to King).
 * @param {number} s The card suit from 1 to 4 (H, C, D, S).
 * @return {B.Card} A new card instance.
 * @constructor
 */
B.Card = function(i, s) {
	var index,
		suit;

	// Validate index.
	if (i < 1 || i > 13) {
		throw new Error('InvalidIndex: ' + i);
	}

	// Validate suit.
	if (s < 1 || s > 4) {
		throw new Error('InvalidSuit: ' + s);
	}


	/**
	 * The index of the card from 1 to 13. This index is used to find the card's
	 * label and value.
	 */
	index = i;


	/**
	 * The index of the suit from 1 to 4. This index is used to find the card's
	 * suit name and symbol.
	 * @type {number}
	 */
	suit = s;


	/**
	 * Return the numerical index of the card.
	 * @return {number} The index from 1 to 13.
	 */
	this.getIndex = function() {
		return index;
	};


	/**
	 * Return the numerical suit index of the card from 0 to 3.
	 * @return {number} The suit index.
	 */
	this.getSuit = function() {
		return suit;
	};

	return this;
};


/**
 * Constant used for hole card display and score display when a hole card is
 * present in a Hand.
 * @type {string}
 */
B.Card.HOLE_CARD = '\u2300';		// 'not' symbol 


/**
 * The labels of the various cards by value index.
 * @type {Array.<string>}
 */
B.Card.LABELS = [null,	// Don't use 0 index.
	'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'
];


/**
 * The names and Unicode symbols for the various suits in 'new deck order',
 * Hearts, Clubs, Diamonds, Spades (aka suit index). For text output we use the
 * black symbols for Spades and Clubs and white symbols for Hearts and Diamonds.
 * @type {Array.<object>}
 */
B.Card.SUITS = [null,	// Don't use 0 index.
	{ name: 'Hearts', symbol: '\u2661' },
	{ name: 'Clubs', symbol: '\u2663' },
	{ name: 'Diamonds', symbol: '\u2662' },
	{ name: 'Spades', symbol: '\u2660' }
];


/**
 * Hole card state. By default cards deal face-up, but not hole cards.
 * @type {boolean}
 */
B.Card.prototype.holeCard = false;


/**
 * Return the text label for the card, such as 'A' for an Ace.
 * @return {string} The string label of the card.
 */
B.Card.prototype.getLabel = function() {
	return B.Card.LABELS[this.getIndex()];
};


/**
 * Return the suit name, ie. Hearts, Diamonds, etc.
 * @return {string} The suit name.
 */
B.Card.prototype.getSuitName = function() {
	return B.Card.SUITS[this.getSuit()].name;
};


/**
 * Return the suit symbol, the Unicode value for the suit name.
 * @return {string} The suit symbol.
 */
B.Card.prototype.getSymbol = function() {
	return B.Card.SUITS[this.getSuit()].symbol;
};


/**
 * Return the value of the card. Note that Aces will always return 11 while
 * face cards (J, Q, K) all return 10. During scoring of Hand instances the
 * Ace values are adjusted to 'soft' (1) values as needed.
 * @return {number} The numerical value of the card from 2 to 11.
 */
B.Card.prototype.getValue = function() {
	var i;

	i = this.getIndex();

	if (i === 1) {
		return 11;
	} else if (i > 10) {
		return 10;
	} else {
		return i;
	}
};


/**
 * Combined setter/getter for the hole card flag.
 * @param {boolean} flag The new value for the holdCard property.
 * @return {boolean} The current setting, after optional flag update.
 */
B.Card.prototype.isHoleCard = function(flag) {
	if (flag !== undefined) {
		this.holeCard = flag;
	}

	return this.holeCard;
};


/**
 * Prints the card's label/symbol pair to the console.
 * @return {B.Card} The receiver.
 */
B.Card.prototype.print = function() {
	if (this.isHoleCard()) {
		return B.Card.HOLE_CARD;
	} else {
		return this.getLabel() + this.getSymbol();
	}
};


//  --------------------------------------------------------------------------- 

/*
 * NOTE: The Deck object is a fully-encapsulated constructor function. The
 * actual card instance creation as well as the card array itself are protected
 * from tampering except through methods on the Deck. Deck mixes in Shuffler to
 * provide a means for shuffling a Deck and Printable to support printing.
 *
 * Why a true Deck of Card instances? Admittedly there's a bit of overhead in
 * creating objects rather than just driving things from a random number
 * generator. Still, for the game to function properly it's important that no
 * card be used twice in a single-deck game, but could be if the game were
 * changed to a multi-deck game. The most sensible thing that allows for future
 * expansion is to accept real Card instances since 52 objects * a deck count
 * shouldn't overburden modern web browsers. Card instances also make some of
 * the computations for card values, printing, etc. far more encapsulated.
 */


/**
 * Constructs a new, unshuffled, deck of Card instances. Note that the default
 * order of cards in the deck matches that of a physical deck of cards. In
 * particular, the card order from top to bottom (aka first to last card in the
 * deck) is Ace through King of Hearts, Ace through King of Clubs, King through
 * Ace of Diamonds, and King through Ace of Spades. Note that the order of suits
 * changes in mid-deck.
 * @return {B.Deck} A new Deck instance.
 * @constructor
 */
B.Deck = function() {
	var i,
		j,
		n,
		cards;

	cards = [];

	// First two suits run from Ace to King. Last two suits run from King to
	// Ace.
	for (i = 1; i < 5; i++) {
		for (j = 1; j < 14; j++) {
			n = i < 3 ? j : 14 - j;
			cards.push(new B.Card(n, i));
		}
	}

	/**
	 * Return the array of Card instances which make up the deck. Note that the
	 * array returned is mutable, which is necessary for shuffling in place.
	 * @return {Array.<B.Card>} The card array.
	 */
	this.getCards = function() {
		return cards;
	};

	return this;
};


// Mix in Printable so we can print our card array on demand.
$.extend(B.Deck.prototype, B.Printable);

// Mix in Shuffler so we get 'shuffled' and 'shuffle' behavior.
$.extend(B.Deck.prototype, B.Shuffler);

//  --------------------------------------------------------------------------- 

/*
 * NOTE: The Shoe object is responsible for dealing the cards. Like a Deck, a
 * Shoe is a collection of cards so we mix in both print and shuffle ability.
 * Like our other constructors we have a mix of private vars/getters and more
 * public methods. The reason for the mix is to help minimize how many copies of
 * functions we're creating as a side-effect of instance creation.
 */


/**
 * Constructs a new Shoe instance and returns it. A 'shoe' is the container for
 * one or more decks of cards which are shuffled and dealt for the game.
 * @param {number} size The number of decks in the shoe. The default is
 *     B.Shoe.DEFAULT_SIZE.
 * @return {B.Shoe} A new Shoe instance.
 * @constructor
 */
B.Shoe = function(size) {
	var cards,
		decks;

	/**
	 * The array of Cards in the shoe. The card list is built from the
	 * individual decks which are added to the shoe.
	 * @type {Array.<B.Card>}
	 */
	cards = [];


	/**
     * The number of Decks this Shoe holds.
	 * @type {number}
	 */
	decks = size || B.Shoe.DEFAULT_SIZE;


	/**
	 * Returns the internal cards array. Note that since the array is
	 * mutable and passed by reference its contents can be modified by
	 * consumers. This is a necessary requirement for shuffling.
	 * @return {Array.<B.Card>} The cards in the shoe.
	 */
	this.getCards = function() {
		return cards;
	};


	/**
     * Returns the number of decks this shoe holds. 
	 * @return {number}
	 */
	this.getSize = function() {
		return decks;
	};


	// Force the shoe to fill.
	this.fill();

	return this;
};


// Mix in Printable so we can print our card array on demand.
$.extend(B.Shoe.prototype, B.Printable);


// Mix in Shuffler so we get 'shuffled' and 'shuffle' behavior.
$.extend(B.Shoe.prototype, B.Shuffler);


/**
 * The default number of decks in a new Shoe.
 * @type {number}
 */
B.Shoe.DEFAULT_SIZE = 1;


/**
 * Adds a deck to the shoe. This operation does not instantly result in a
 * shuffle. The shoe will only shuffle if it is unshuffled and is asked to
 * deal a card.
 * @param {B.Deck} deck A deck of cards.
 * @return {B.Shoe} The receiver.
 */
B.Shoe.prototype.addDeck = function(deck) {
	var cards;

	// Note the mixin property update here for B.Shuffler.
	this.shuffled = false;

	cards = this.getCards();

	// Use apply here to flatten the incoming deck's cards into the
	// receiver, otherwise we'll end up with an array of array of cards.
	cards.push.apply(cards, deck.getCards());

	return this;
};


/**
 * Deals a single card from the shoe. This reduces the number of cards in the
 * shoe by one. If the shoe is empty when this method is called the shoe is
 * filled, shuffled, and a new card is vended from the resulting card stack.
 * @param {boolean} holeCard True if the vended card is meant as a hole card.
 */
B.Shoe.prototype.deal = function(holeCard) {
	var cards,
		card;

	// Shuffle won't actually shuffle if the receiver is already shuffled.
	this.shuffle();

	cards = this.getCards();

	// Return the first card in the cards collection, reducing the cards in
	// the shoe by one.
	card = cards.shift();

	// If we're out of cards we have to fill and vend from the fresh list.
	if (!card) {
		this.fill();
		return this.deal(holeCard);		// Pass along holeCard state flag.
	}

	// Update state of card if this is supposed to be a hole card (face down).
	if (holeCard) {
		card.isHoleCard(true);
	}

	return card;
};


/**
 * Fills the shoe. An extension here to provide incoming cards as a
 * parameter might allow this type to support Continuous Shuffle by adding
 * the discard pile after each Hand and allowing deal()'s natural shuffle
 * triggering to run.
 * @return {B.Shoe} The receiver.
 */
B.Shoe.prototype.fill = function() {
	var i,
		count,
		cards;

	// For continuous shuffling we'd remove this check and perhaps add cards
	// from an array of passed in discards.
	cards = this.getCards();
	if (cards.length !== 0) {
		throw new Error('InvalidOperation: Cannot fill unless empty.');
	}

	count = this.getSize();
	for (i = 0; i < count; i++) {
		this.addDeck(new B.Deck());
	}

	return this;
};


//  --------------------------------------------------------------------------- 
//  Players / Hands
//  --------------------------------------------------------------------------- 

/*
 * NOTE: Player instances associate a set of holdings with a set of Hands. The
 * player manages holdings while Hands escrow bets. If a Hand wins, pushes,
 * pays insurance, or is surrendered, the payout is added to the player's
 * holdings. If a Hand busts or loses the escrowed amount of the bet is simply
 * discarded along with the Hand (we don't track House winnings).
 */


/**
 * Constructs a new Player instance and returns it. Player instances manage
 * holdings and are associated with one or more Hands which manage a set of
 * cards and the bets related to those cards.
 * @param {B.Game} g The game the player is in.
 * @param {number} h The holdings the player starts with.
 * @return {B.Player} A new Player instance.
 * @constructor
 */
B.Player = function(g, h) {
	var bet,
        game,
		holdings;

	// Validate game instance.
	if (!g) {
		throw new Error('InvalidGame');
	}

	// Validate holdings.
	if (!h) {
		throw new Error('InvalidHoldings');
	}


    /**
     * The amount of the player's initial bet, prior to a hand being dealt. Once
     * a hand is dealt this value is transferred to the hand. From that point
     * forward bets are specific to the hand(s) being played.
     * @type {number}
     */
    bet = 0;


	/**
	 * The game this player is a part of.
	 * @type {B.Game}
	 */
	game = g;


	/**
	 * The number of chips the player has left.
	 * @type {number}
	 */
	holdings = h;


	/**
	 * Adjusts the receiver's holdings up or down by the amount provided.
	 * @param {number} amount The amount to adjust holdings by.
	 */
	this.adjustHoldings = function(amount) {
		holdings = this.getHoldings() + amount;
	};


    /**
     * Returns the initial bet for the player used to define the initial bet for
     * any hands which may be split, doubled, etc.
     */
    this.getBet = function() {
        return bet;
    };


	/**
	 * Returns the game this Player is part of.
	 * @return {B.Game} The game.
	 */
	this.getGame = function() {
		return game;
	};


	/**
	 * Returns the number of chips the player has left.
	 * @return {number} The number of chips.
	 */
	this.getHoldings = function() {
		return holdings;
	};


    /**
     * Increases the receiver's initial bet value by amount.
     * @param {number} amount The amount of increase.
     */
    this.increaseBet = function(amount) {
        this.adjustHoldings(amount * -1);
        bet += amount;
        game.renderBet();
    };


    /**
     * Places an initial bet.
     * @param {number} amount The amount being bet.
     */
    this.placeBet = function(amount) {
        this.adjustHoldings(amount * -1);
        bet = amount;
    };

	return this;
};


//  --------------------------------------------------------------------------- 

/*
 * NOTE: 
 *
 * The Game interacts primarily with Hands and only indirectly with the Player.
 * The link between a Hand and a Player is maintained by the Hand instance, not
 * the Player instance, and most operations affecting a Player are driven from
 * methods/events invoked on a specific Hand.
 */


/**
 * Creates a new Hand of Cards and returns it. The Hand actually owns the cards
 * and bet, while the Hand's player is responsible for activity related to
 * managing the player's chips. The Game instance provides each Hand with an
 * object to notify when the state of the Hand changes in lieu of pub/sub.
 * @param {B.Game} g The Game this Hand of cards is a part of.
 * @param {B.Player} p The Player of this particular Hand of cards. Optional.
 * @return {B.Hand} A new Hand instance.
 * @constructor
 */
B.Hand = function(g, p) {
	var bet,
		cards,
		fsm,
		game,
		player,
		playerOnly;


	// Validate game instance.
	if (!g) {
		throw new Error('InvalidGame');
	}

	/**
     * The current bet amount.
     * @type {number}
     */
	bet = 0;


	/**
     * The array of cards in the Hand.
	 * @type {Array.<B.Card>}
     */
	cards = [];


	/**
	 * The state machine which controls overall hand logic.
	 * @type {StateMachine}
	 */
	fsm = StateMachine.create({
		initial: 'empty',
		error: function(evt, from, to, args, code, msg) {
			var str = 'Hand cannot transition from: ' +
				from + ' state to: ' + to + ' state. ' + msg;
			throw new Error('InvalidStateTransition: ' + str);
		},
		events: [
			// Each hit changes the state to help us know what options are
			// available. Note that you can't hit() on doubled, the state
			// we get from using 'double'.
			{ name: 'hit', from: 'empty', to: 'single' },
			{ name: 'hit', from: 'single', to: 'pair' },
			{ name: 'hit', from: 'pair', to: 'hit' },
			{ name: 'hit', from: 'hit', to: 'hit' },

			// Stand from opening pair or after a hit. Doubled is already
			// standing as is 'blackjack'. Surrendered and busted are failure
			// states, not possible success states.
			{ name: 'stand', from: ['pair', 'hit'], to: 'standing' },

			// True blackjack only happens with a pair.
			{ name: 'blackjack', from: 'pair', to: 'blackjack' },

			// Many events are only legal when the Hand is in the initial
			// pair state with two cards.
			{ name: 'split', from: 'pair', to: 'single' },
			{ name: 'double', from: 'pair', to: 'doubled' },
			{ name: 'surrender', from: 'pair', to: 'surrendered' },

			// You can bust from hit or doubled states.
			{ name: 'bust', from: ['doubled', 'hit'], to: 'busted' }
		]});

	// Set up 'return false' handlers for states you can't get to for Dealer
	// Hands.
	playerOnly = function() {
		return player !== null && player !== undefined;
	};
	fsm.onbeforedouble = playerOnly;
	fsm.onbeforesplit = playerOnly;
	fsm.onbeforesurrender = playerOnly;
	this.canDouble = playerOnly;
	// NOTE this.canSplit is implemented with more detailed logic.
	this.canSurrender = playerOnly;

	// Configure a nice debugging log function to observe state transitions.
	fsm.onchangestate = function(evt, from, to) {
        if (DEBUG) {
            log('Hand event: ' + evt + ' from: ' +
                from + ' to: ' + to + '.');
        }
	};

	if (DEBUG) {
		log('Initialized ' + (p ? 'player' : 'dealer') + ' hand state.');
	}


	/**
	 * The game this Hand is a part of.
	 * @type {B.Game}
	 */
	game = g;


	/**
     * The player of the Hand, where funds for the Hand's bets are managed. Note
	 * that the Hand played on behalf of the Dealer has no player assigned.
	 * @type {B.Player}
	 */
	player = p;


	/**
	 * Returns the current bet amount.
	 * @return {number}
	 */
	this.getBet = function() {
		return bet;
	};


	/**
	 * Return the array of Card instances which make up the Hand. Note that the
	 * array returned is mutable, which is necessary for operations like hit()
	 * and split() to function. This could be altered for more security.
	 * @return {Array.<B.Card>} The card array.
	 */
	this.getCards = function() {
		return cards;
	};


	/**
     * Returns the state machine which controls the state of the Hand.
	 * @return {StateMachine} The StateMachine which controls the state of this
	 *     Hand.
	 */
	this.getFSM = function() {
		return fsm;
	};


	/**
	 * Returns the game this Player is part of.
	 * @return {B.Game} The game.
	 */
	this.getGame = function() {
		return game;
	};


	/**
	 * Returns the Player whose holdings are backing this Hand.
	 * @return {B.Player} The player.
	 */
	this.getPlayer = function() {
		return player;
	};


	/**
	 * Sets the bet amount for the Hand.
	 * @param {number} amount The value of the bet.
	 * @private
	 */
	this._setBet = function(amount) {
		bet = amount;
	};

	// Connect the various FSM transition hooks to Hand methods.
	fsm.onpair = this.onpair.bind(this);

    // initial bet amount.
	if (player) {
		bet = player.getBet();
	}

	return this;
};


// Mix in Printable so we can print our card array on demand.
$.extend(B.Hand.prototype, B.Printable);


/**
 * A list of the states a Hand can be in which are 'playable', meaning they can
 * still accept new cards or other actions.
 * @type Array.<string>
 */
B.Hand.PLAYABLES = ['pair', 'hit'];


/**
 * A list of the states a Hand can be in which are 'scoreable', meaning they
 * should be checked during scoring as a possible winning hand.
 * @type Array.<string>
 */
B.Hand.SCOREABLES = ['standing', 'doubled', 'blackjack'];


/**
 * This Hand just went over 21. The player immediately loses any bet
 * associated with this Hand and the Hand is marked 'busted'.
 */
B.Hand.prototype.bust = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.bust();

	this.getGame().bust(this);
};


/**
 * Returns true if the Hand is truly splittable, meaning it is a pair of cards
 * which have the same value.
 * @return {boolean} Whether the hand is truly splittable.
 */
B.Hand.prototype.canSplit = function() {
	var fsm,
		cards;

	// Dealer can't split.
	if (!this.getPlayer()) {
		return false;
	}

	fsm = this.getFSM();
	cards = this.getCards();

	// If we're in the right state to be able to split the other question is do
	// we have two Cards of the same index from 1 to 13 ? 
	if (fsm.can('split')) {
		if (cards[0].getIndex() === cards[1].getIndex()) {
			return true;
		}
	}
	return false;
};


/**
 * The bet for this Hand should be doubled and a single card should be added
 * to the Hand. Once the Hand receives that card no additional cards may be
 * added to the Hand.
 */
B.Hand.prototype.double = function() {
	var fsm,
		cards,
		game;

	if (!this.canDouble()) {
		throw new Error('InvalidOperation: Dealer hand cannot be doubled.');
	}

	fsm = this.getFSM();
	fsm.double();

	// This will throw an exception if the bet isn't supportable.
	this.increaseBet(this.getBet());

	// Add a card to the receiver and check to see if we busted.
	game = this.getGame();
	cards = this.getCards();
	cards.push(game.getShoe().deal());
	if (this.getScore() > 21) {
		this.bust();
		return;
	}

	this.getGame().double(this);
};


/**
 * Returns the maximum bet for a Hand.
 * @return {number} The maximum bet amount.
 */
B.Hand.prototype.getMaximumBet = function() {
	return this.getGame().getMaximumBet();
};


/**
 * Returns the minimum bet for a Hand. This represents 'table stakes'.
 * @return {number} The minimum bet.
 */
B.Hand.prototype.getMinimumBet = function() {
	return this.getGame().getMinimumBet();
};


/**
 * Returns the score of the Hand. When aces are included in the Hand they
 * are counted as 11 unless such a count would cause the Hand to bust, in
 * which case they are counted as 1. NOTE that the current version of this
 * method exposes hole-card values.
 * @return {number} The score.
 */
B.Hand.prototype.getScore = function() {
	var s,
		aces,
		cards;

	s = 0;
	aces = 0;
	cards = this.getCards();

	// Iterate over cards, summing the values of all non-Aces and counting aces.
	// We'll add Ace values in a second phase.
	cards.map(function(card) {
		var value;

		value = card.getValue();
		if (value === 11) {
			aces++;
			return;
		}
		s += value;
	});

	// Process Aces. The approach here is that if the Ace as an 11 plus any
	// other Aces as 1's works we keep the 11, otherwise we use 1 for value.
	while (aces--) {
		if (s + 11 + aces > 21) {
			s += 1;
		} else {
			s += 11;
		}
	}

	return s;
};


/**
 * Returns true if the Hand has at least one hole card, a Card whose value
 * should not be shown or otherwise disclosed.
 * @return {boolean} True if the Hand has a hole card.
 */
B.Hand.prototype.hasHoleCards = function() {
	var cards,
		i,
		len;

	cards = this.getCards();
	len = cards.length;
	for (i = 0; i < len; i++) {
		if (cards[i].isHoleCard()) {
			return true;
		}
	}

	return false;
};


/**
 * Adds a card to the Hand, provided that the current state allows it.
 * @param {B.Card} card The new card to add to the Hand.
 */
B.Hand.prototype.hit = function(card) {
	var c,
        fsm,
		cards,
        game;

    game = this.getGame();
    c = card || game.getShoe().deal();

	cards = this.getCards();
	cards.push(c);

	fsm = this.getFSM();
	fsm.hit();

	// With every new card we test and invoke the bust() event if the card
	// has pushed us over our limit.
	if (this.getScore() > 21) {
		this.bust();
	}

    game.renderHands();
};


/**
 * Increases the amount bet on this Hand. The final amount must not exceed
 * the maximum bet limit for the current Game.
 * @param {number} amount The amount to increase the bet.
 */
B.Hand.prototype.increaseBet = function(amount) {
	var player,
		newBet,
		bet;

	newBet = this.getBet() + amount;
	if (newBet > this.getMaximumBet()) {
		throw new Error('Bet of ' + newBet +  ' exceeds maximum.');
	}

	player = this.getPlayer();
	if (player.getHoldings() < amount) {
		throw new Error('Bet of ' + amount + ' exceeds player holdings.');
	}

	// Remove funds from the player and escrow them with the Hand. NOTE we set
	// the amount negative since the adjustHoldings call is used for both
	// increasing and decreasing holdings.
	player.adjustHoldings(amount * -1);
	this._setBet(newBet);

    this.getGame().renderBet();
};


/**
 * Officially 'Blackjack' only occurs when there are two cards, an Ace and a
 * card with a value of 10. Other combinations which score 21 are 'twenty-one'
 * but not 'blackjack'. Two blackjacks are a push but blackjack wins over 21.
 * @return {boolean} True if the Hand represents a blackjack.
 */
B.Hand.prototype.isBlackjack = function() {
	var fsm,
        cards,
		bjack;

    fsm = this.getFSM();
    if (fsm.current === 'blackjack') {
        // We check in multiple pathways. Do work once.
        return true;
    }

	if (DEBUG) {
		log('Checking ' + (this.getPlayer() ? 'player ' : 'dealer ') +
            this.print() + ' for blackjack.');
	}

	cards = this.getCards();

	// Two cards and score must equal 21.
	bjack = cards.length === 2 && this.getScore() === 21;
	if (bjack) {
		fsm.blackjack();
		this.getGame().blackjack(this);
	}

	return bjack;
};


/**
 * Returns true if the hand is in a state that allows further actions. For
 * example, 'busted', 'doubled', or 'surrendered' are non-playable states while
 * 'pair' and 'hit' are playable.
 * @return {boolean} True if the Hand supports additional cards/actions.
 */
B.Hand.prototype.isPlayable = function() {
	return B.Hand.PLAYABLES.indexOf(this.getFSM().current) !== -1;
};


/**
 * True is the Hand is in a state that means it's worth scoring. For example,
 * 'busted' and 'surrendered' are not worth scoring.
 * @return {boolean} True if the Hand is worth scoring.
 */
B.Hand.prototype.isScoreable = function() {
	return B.Hand.SCOREABLES.indexOf(this.getFSM().current) !== -1;
};


/**
 * Responds to notifications that the Hand has a pair of cards. This state is
 * interesting due to a need to check for blackjack etc.
 */
B.Hand.prototype.onpair = function() {
	// Test for blackjack status. This call will notify the Game as
	// needed if that status is true.
	this.isBlackjack();
};


/**
 * Instructs the Hand to pay out. This is invoked on Hands whose score is higher
 * than that of the Dealer's Hand without busting.
 * @param {number} odds A multipler for odds. 3:2 would be 1.5 for example.
 */
B.Hand.prototype.pay = function(odds) {
	var player,
		bet,
		winnings;

	player = this.getPlayer();
	if (player) {
		bet = this.getBet();
		winnings = bet + (bet * odds);
		player.adjustHoldings(winnings);

		// Note the use of _print here to leave off score.
		log('Hand ' + this._print() + ' paying ' + odds +
			' to 1 odds, or ' + winnings + '.');
	}
};


// Highjack our mixin version of print so we can augment it.
B.Hand.prototype._print = B.Hand.prototype.print;


/**
 * Prints the Hand. Hands print their values/suits as well as their score, with
 * the exception that hole cards print as a 'not' or 'null' symbol and the score
 * is likewise disguised to keep from exposing the true value of the hand.
 * @return {string} The print string.
 */
B.Hand.prototype.print = function() {
	return this._print() + ' => ' +
		(this.hasHoleCards() ? B.Card.HOLE_CARD : this.getScore());
};


/**	
 * The Hand was a tie. No change in holdings, but the current bets are
 * returned to the player's holdings.
 */
B.Hand.prototype.push = function() {
	var player,
		bet;

	player = this.getPlayer();
	if (player) {
		// The bet returns to the player on a tie.
		bet = this.getBet();
		player.adjustHoldings(bet);

		// Note the use of _print here to leave off score.
		log('Hand ' + this._print() + ' pushed. Returning ' +
			'bet of ' + bet + '.');
	}
};


/**
 * Displays the hand's hole cards, if any. Upon show(), if the hand only has two
 * cards, it is checked for a Blackjack status.
 * @return {B.Hand} The receiver.
 */
B.Hand.prototype.show = function() {
	var cards,
		holes;

	holes = 0;
	cards = this.getCards();

	cards.map(function(card) {
		if (card.isHoleCard()) {
			holes++;
			card.isHoleCard(false);
		}
	});

    return this;
};


/**
 * Splits the Hand, creating a second Hand with the same player as the owner
 * and one of the two current cards as its first card.
 */
B.Hand.prototype.split = function() {
	var fsm;

	if (!this.canSplit()) {
		// Simulate consistent error messages with other operations.
		fsm = this.getFSM();
		if (!fsm.can('split')) {
			log('Error: InvalidStateTransition: Hand cannot transition ' +
				'from: ' + fsm.current + ' state to: single state. ' +
				'event split inappropriate in current state ' + fsm.current);
		} else if (!this.getPlayer()) {
			// Dealer hands can't be split.
			throw new Error('InvalidOperation: Dealer hand cannot be split.');
		}
		return;
	}

	// Request help from the Game, where the new Hand must be registered.
	this.getGame().split(this);
};


/**
 * Stands, meaning the Hand transitions to a state where no more cards will be
 * accepted.
 */
B.Hand.prototype.stand = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.stand();

	this.getGame().stand(this);
};


/**	
 * Surrenders the Hand. The player's holdings are adjusted such that they
 * forfeit half of their current bet.
 */
B.Hand.prototype.surrender = function() {
	var fsm,
		player;

	if (!this.canSurrender()) {
		throw new Error('InvalidOperation: Dealer hand cannot be surrendered.');
	}

	fsm = this.getFSM();
	fsm.surrender();

	// Surrendering a Hand should return half the bet to the player.
	player = this.getPlayer();
	player.adjustHoldings(this.getBet() / 2.0);

	this.getGame().surrender(this);
};


//  --------------------------------------------------------------------------- 
//  Game
//  --------------------------------------------------------------------------- 

/**
 * Creates and returns a new Game instance. The Game is responsible for overall
 * flow between dealing, processing the player's Hand(s), and scoring the final
 * result after the dealer's Hand has been filled.
 * @param {object} opts Optional game control parameters. Common keys are
 *	   decks (how many decks), min (minimum bet), max (maximum bet), chips
 *	   (initial player holdings).
 * @return {B.Game} A new Game instance.
 * @constructor
 */
B.Game = function(opts) {
	var dealer,
		decks,
		fsm,
		hands,
		holdings,
		maxBet,
		minBet,
		player,
		options,
		shoe;

	/**
	 * An optional object whose key/value pairs provide configuration data.
	 * @type {object}
	 */
	options = opts || {};	// Simplify lookup/defaulting syntax below.


	/**
	 * The dealer's Hand. We hold this Hand separate for easy comparison with
	 * player Hands which are kept in the hands[] array.
	 * @type {B.Hand}
	 */
	dealer = null;


	/**
	 * The number of decks in the Shoe.
	 * @type {number}
	 */
	decks = options.decks || B.Game.DEFAULT.DECK_COUNT;


	/**
	 * The state machine which embodies the game state and transitions.
	 * Effectively the game goes from a pregame state to dealing the initial
	 * hands. From there all player hands are managed until no hands remain
	 * 'playable'. Once that's true the game moves to the dealer. Before the
	 * dealer does anything else a player can opt for insurance _iff_ the
	 * dealer's up-card is an Ace. Otherwise the dealer's hand is managed using
	 * the rules for stay/hit until the dealer's hand is no longer 'playable'.
	 * If the dealer doesn't bust a final scoring/payout phase is done and the
	 * game ends, resetting to allow a new deal to begin or for the entire game
	 * to be exited.
     * @type {StateMachine} The newly created/initialized state machine.
	 */
	fsm = StateMachine.create({
		initial: 'pregame',
		error: function(evt, from, to, args, code, msg) {
			var str = 'Game cannot transition from: ' +
				from + ' state to: ' + to + ' state. ' + msg;
			throw new Error('InvalidStateTransition: ' + str);
		},
		events: [
			{ name: 'deal', from: ['pregame', 'postgame'], to: 'dealing' },

            // Normal flow is players, then dealer.
			{ name: 'player', from: 'dealing', to: 'player' },
			{ name: 'dealer', from: 'player', to: 'dealer' },

			// If the player is low on chips before the deal no hands are
			// dealt and the state moves to 'buying'.
			{ name: 'buyin', from: 'dealing', to: 'buying' },

			// Blackjack for dealer will mean straight to scoring.
			{ name: 'blackjack', from: 'dealing', to: 'scoring' },

            // Dealer bust takes us straight to scoring.
			{ name: 'bust', from: 'dealer', to: 'scoring'},

            // Scoring can happen directly from dealing if either the player or
            // the dealer has a blackjack.
			{ name: 'score', from: ['dealing', 'dealer'], to: 'scoring' },

            // We can move properly to 'done' once we've scored the game.
			{ name: 'done', from:
                ['dealer', 'scoring', 'postgame'], to: 'postgame' },

            // We can quit from anywhere.
			{ name: 'quit', from: '*', to: 'exited' }
		]});

	// Configure a nice debugging log function to observe state transitions.
	fsm.onchangestate = function(evt, from, to) {
        if (DEBUG) {
            log('Game event: ' + evt + ' from: ' +
                from + ' to: ' + to + '.');
        }
	};

	if (DEBUG) {
		log('Initialized Game state.');
	}

	/**
	 * A list of all player Hands currently active.  This is an array to support a
	 * player having multiple Hands due to splitting.
	 * @type {Array.<B.Hand>}
	 */
	hands = [];


	/**
	 * The default starting holdings for the player.
	 * @type {number}
	 */
	holdings = options.chips || B.Game.DEFAULT.HOLDINGS;


	/**
	 * The maximum bet for this game instance.
	 * @type {number}
	 */
	maxBet = options.max || B.Game.DEFAULT.MAXIMUM_BET;


	/**
	 * The minimum bet for this game instance.
	 * @type {number}
	 */
	minBet = options.min || B.Game.DEFAULT.MINIMUM_BET;


	/**
	 * The player for the game.
	 * @type {B.Player}
	 */
	player = new B.Player(this, holdings);


	/**
	 * The Shoe used to deal cards for the game.
	 * @type {B.Shoe}
	 */
	shoe = new B.Shoe(decks);


	/**
	 * Returns the dealer's Hand.
	 * @return {B.Hand} The dealer's Hand.
	 */
	this.getDealer = function() {
		return dealer;
	};


	/**
     * Returns the state machine which controls the state of the Hand.
	 * @return {StateMachine} The StateMachine which controls the state of this
	 *     Hand.
	 */
	this.getFSM = function() {
		return fsm;
	};


	/**
	 * Returns the Player's Hands.
	 * @return {Array.<B.Hand>} The player's Hands.
	 */
	this.getHands = function() {
		return hands;
	};


	/**
	 * Returns the maximum value a player can bet for this game.
	 * @return {number} The maximum bet.
	 */
	this.getMaximumBet = function() {
		return maxBet;
	};


	/**
	 * Returns the minimum value a player can bet for this game.
	 * @return {number} The minimum bet.
	 */
	this.getMinimumBet = function() {
		return minBet;
	};


	/**
	 * Returns any startup configuration options for the game. Note that the
	 * options are mutable so they can be modified by callers.
	 * @return {object} Startup options.
	 */
	this.getOptions = function() {
		return options;
	};


	/**
	 * Returns the Player.
	 * @return {B.Player} The player.
	 */
	this.getPlayer = function() {
		return player;
	};


	/**
	 * Returns the shoe being used to deal cards.
	 * @return {B.Shoe} The game's shoe.
	 */
	this.getShoe = function() {
		return shoe;
	};


	/**
	 * Defines the Hand played by the Dealer.
	 * @param {B.Hand} hand The new Hand for the dealer.
	 * @return {B.Hand} The new hand.
	 * @private
	 */
	this._setDealer = function(hand) {
		dealer = hand;
		return dealer;
	};


	// Connect the various FSM transition hooks to game methods.
	fsm.onafterdealer = this.onafterdealer.bind(this);
	fsm.onafterdone = this.onafterdone.bind(this);

    player.placeBet(this.getMinimumBet());

	return this;
};


/**
 * A Dictionary of default values for the class.
 * @enum {object}
 */
B.Game.DEFAULT = {
	DECK_COUNT: 1,			// Default is a single-deck game.
	HOLDINGS: 500,			// Default is 500 chips.
	MAXIMUM_BET: 100,		// No more than 100 chips per Hand.
	MINIMUM_BET: 5,			// 1 chip minimum.
	PAYOUT_BLACKJACK: 1.5,  // 3:2 on blackjack wins.
	PAYOUT_INSURED: 2.0,    // 2:1 on insurance.
	PAYOUT_WINNER: 1.0,     // 1:1 on normal wins.
	PLAYER_COUNT: 1			// 1 player by default.
};


/**
 * Invoked when a Hand has a blackjack (Ace and ten-value).
 */
B.Game.prototype.blackjack = function(hand) {
	var prefix,
        my;

	hand.show();

	if (DEBUG) {
		prefix = (hand === this.getDealer()) ? 'Dealer' : 'Player';
		log(prefix + ' Blackjack!: ' + hand.print());
	}

    my = this;

	// If it's the dealer's hand we show it immediately. Only another hand with
	// a Blackjack will avoid a loss, and those hands merely tie/push.
	if (hand === this.getDealer()) {
		// When it's the dealers hand we move immediately to scoring/payout.	
		this.getFSM().blackjack();
        setTimeout(function() {
		    my.score();
        }, 0);

	} else {
        // For player hands which transition to blackjack status we may have no
        // remaining playable hands and need to transition. The tricky part here
        // is that the dealer's hand is dealt to last, so any true blackjack on
        // the part of a player hand will cause scoring against an incomplete
        // dealer hand. We use a setTimeout to let the deal finish first.
        setTimeout(function() {
            my.checkHands();
        }, 0);
    }
};


/**
 * Invoked when a Hand busts. If the Hand was the dealer's Hand then any active
 * hands remaining are winners. If the Hand was a player's Hand then it is
 * discarded from the Game. If no active player Hands remain the Game ends and
 * the option to deal a new set of Hands is provided.
 * @param {B.Hand} hand The hand which busted.
 */
B.Game.prototype.bust = function(hand) {
	var prefix;

	if (DEBUG) {
		prefix = (hand === this.getDealer()) ? 'Dealer' : 'Hand';
		log(prefix + ' busted: ' + hand.print());
	}

	this.checkHands();
};


/**
 * Checks all player hands to see if any remain playable. If not this method
 * will transition the game to the dealer state.
 */
B.Game.prototype.checkHands = function() {
	var fsm,
		hands,
		done;

	done = true;
	hands = this.getHands();
	hands.map(function(hand) {
		if (hand.isPlayable()) {
			done = false;
		}
	});

	fsm = this.getFSM();
	if (done) {
        // No remaining playable hands. 
        if (fsm.can('dealer')) {
            fsm.dealer();
        } else if (fsm.can('score')) {
            this.score();
        }
	} else {
        if (fsm.can('player')) {
            this.play();
        }
    }
};


/**
 * Handles state transition after the initial deal for a new game is done. While
 * the first two cards are being dealt to each player no UI actions are allowed.
 * Once the initial deal has completed the game moves into 'player' mode in
 * which the player's state machine is in control of one or more Hands.
 */
B.Game.prototype.deal = function() {
	var fsm,
        game,
		dealer,
		hands,
		shoe,
		my;

	fsm = this.getFSM();
	fsm.deal();

    game = this;

    // Update display for fresh visuals.
    this.renderDeal(function() {
        // Update the player's holdings display, and the amount of the minimum bet
        // to support the new hand.
        d3.select('#holdings .value').text(game.getPlayer().getHoldings());
        d3.select('#pot .value').text(game.getPlayer().getBet());
    });

	// If the player can't cover the minimum bet we can't continue.
	if (this.getPlayer().getHoldings() < this.getMinimumBet()) {
		fsm.buyin();
		return;
	}

	// Note we keep using the current shoe, letting it refill on its own when it
	// empties.	
	shoe = this.getShoe();

	// Clear and/or replace the hands for player and dealer.
	hands = this.getHands();
	hands.length = 0;
	hands.push(new B.Hand(this, this.getPlayer()));
	dealer = this._setDealer(new B.Hand(this));

	// Now that we have the Hands built we need to deal Cards in the proper
	// order. One card to each player hand, then to dealer, then one more to
	// each player, and a hole card to the dealer.

	hands.map(function(hand) {
		hand.hit(shoe.deal());
	});
	dealer.hit(shoe.deal());
	hands.map(function(hand) {
		hand.hit(shoe.deal());
	});
	dealer.hit(shoe.deal(true));	// Hole card.

	// Use a local var to bind 'this' in our callback below.
	my = this;

	// Use an embedded callback here. We need to check the FSM state before we
	// decide whether to invoke a state transition after rendering.
	this.renderHands(function() {
        my.checkHands();
	});
};


/**
 * Responds to notifications that a Hand doubled.
 * @param {B.Hand} hand The hand which doubled.
 */
B.Game.prototype.double = function(hand) {

	if (DEBUG) {
		log('Hand doubled: ' + hand.print());
	}

	this.checkHands();
};


/**
 * Returns a handle to the next playable hand in the game. This is a useful way
 * to interact with the hands in order, ignoring those which are complete.
 * @return {B.Hand} The next playable hand.
 */
B.Game.prototype.getNextHand = function() {
    var hands,
        i,
        len,
        hand;

    hands = this.getHands();
    len = hands.length;
    for (i = 0; i < len; i++) {
        hand = hands[i];
        if (hand.isPlayable()) {
            return hand;
        }
    }

    return;
};


/**
 * Responds to state changes into the dealer state. Once we enter this state we
 * play out the dealer's hand according to the 'hit rules' and then score the
 * various Player hands.
 */
B.Game.prototype.onafterdealer = function() {
	var dealer,
		shoe;

	dealer = this.getDealer();
	dealer.show();

    // Dealer must play out.
	shoe = this.getShoe();
	while (dealer.getScore() < 17) {
		dealer.hit(shoe.deal());
	}

    // If the hand busted over the hit() it'll already be on its way to scoring.
    if (dealer.getScore() <= 21) {
	    this.score();
    }
};


/**
 * Processes the final done state transition.
 */
B.Game.prototype.onafterdone = function() {

    this.renderHands();
	log('Game over.');
};


/**
 * Transitions the game to the player state. This state remains in effect until
 * all Hands have been played. Then the dealer's hand is played out.
 */
B.Game.prototype.play = function() {
	var fsm;

	fsm = this.getFSM();
	fsm.player();
};


/**
 * Quits the game, turning off all active controls.
 */
B.Game.prototype.quit = function() {
	var fsm,
        pot;

	fsm = this.getFSM();
	fsm.quit();

    // Put any chips in the pot back in the player's holdings.
    pot = d3.select('#pot .value').text();
    d3.select('#pot .value').text('0');
    this.getPlayer().adjustHoldings(parseInt(pot, 10));
    d3.select('#holdings .value').text(this.getPlayer().getHoldings());

	// Clear all game state and redisplay the splash screen to support
	// moving into test() mode or invoking a new game() sequence.
    this.renderDeal();

    // Turn off all button visuals.
    d3.selectAll('#controls button').attr('off', true);
    d3.selectAll('#bets button').attr('off', true);

    // Disable all click handlers.
    d3.selectAll('button').on('click', function() {
        return;
    });
};


/**
 * Renders new data related to the betting process.
 */
B.Game.prototype.renderBet = function() {
    var game,
        player;

    game = this;
    player = game.getPlayer();
    log('player bet: ' + player.getBet());

    d3.selectAll('#bets button').attr('off', function() {
        var bet,
            amount;
        // If the button amount would violate the rules (over max, money
        // player doens't have) then it's off.
        bet = player.getBet();
        amount = parseInt(this.innerHTML);
        if ((bet + amount) > player.getHoldings()) {
            return true;
        }
        if ((bet + amount) > game.getMaximumBet()) {
            return true;
        }
        return false;
    });
    d3.selectAll('#bets button').on('click', function() {
        // If the button amount would violate the rules (over max, money
        // player doens't have) then it should ignore clicks.
        if (this.attributes.off.value === 'true') {
            return;
        }
        player.increaseBet(parseInt(this.innerHTML, 10));
    });

    d3.select('#holdings .value').text(player.getHoldings());
    d3.select('#pot .value').text(player.getBet());
};


/**
 * Renders a fresh set of visuals for a fresh deal.
 */
B.Game.prototype.renderDeal = function(callback) {

    // Remove all active cards.
    d3.selectAll('.card').remove();

    // Clear all current score values.
    d3.select('#dealer .score').text('');
    d3.select('#player .score').text('');
};


/**
 * Renders the Hands being played. This method can be called multiple times as
 * the Hands change during play.
 * @param {Function} callback A function to call when rendering is finished.
 */
B.Game.prototype.renderHands = function(callback) {
    var dealer,
        player,
        game,
        cards;

    if (DEBUG) {
        log('Rendering hands.');
    }

    game = this;

    // Render the dealer's cards.
    dealer = this.getDealer();
    d3.select('#dealer').selectAll('div').data(dealer.getCards()).
        enter().append('div').
            attr('class', 'card').
            html(function(d) {
                if (d.isHoleCard()) {
                    return '<img src="images/bicycle-cards.png"' +
                        ' width="100px" height="135px"></img>';
                } else {
                    return '<span class="label">' + d.getLabel() + '</span>' +
                        '<span class="symbol">' + d.getSymbol() + '</span>';
                }
            });

    // Until the dealer shows their hand we can skip updating. But once they
    // show() and turn off hole card hiding we need to update.
    if (dealer.hasHoleCards()) {
        d3.select('#dealer .score').text('');
    } else {
        d3.select('#dealer').selectAll('.card').data(dealer.getCards()).
            html(function(d) {
                return '<span class="label">' + d.getLabel() + '</span>' +
                    '<span class="symbol">' + d.getSymbol() + '</span>';
            });
        d3.select('#dealer img').attr('display', 'none');
        d3.select('#dealer .score').text(dealer.getScore());
    }

    // Render the player's cards from an enter() perspective. New cards.
    player = this.getHands()[0];
    d3.select('#player').selectAll('div').data(player.getCards()).
        enter().append('div').
            attr('class', 'card').
            html(function(d) {
                 return '<span class="label">' + d.getLabel() + '</span>' +
                    '<span class="symbol">' + d.getSymbol() + '</span>';
            });
    d3.select('#player .score').text(player.getScore());

    // Refresh display of cards that are not new.
    d3.select('#player').selectAll('.card').data(player.getCards()).
        html(function(d) {
            return '<span class="label">' + d.getLabel() + '</span>' +
                '<span class="symbol">' + d.getSymbol() + '</span>';
        });


    // Connect hand-specific event handlers.
    d3.select('#hit').on('click',
        function() {
            if (player.isPlayable()) {
                player.hit();
            }
        });
    d3.select('#stand').on('click',
        function() {
            if (player.isPlayable()) {
                player.stand();
            }
        });
    d3.select('#surrender').on('click',
        function() {
            if (player.getFSM().can('surrender')) {
                player.surrender();
            }
        });

    if (player.isPlayable()) {
        d3.selectAll('#bets button').attr('off', true);
        // By default the buttons for betting are not active.
        d3.selectAll('#bets button').on('click', function() {
            return;
        });
    } else {
        this.renderBet();
    }

    // Update button states for visible feedback.
    d3.select('#hit').attr('off', function(d) {
        return !player.isPlayable();
    });
    d3.select('#stand').attr('off', function(d) {
        return !player.isPlayable();
    });
    d3.select('#surrender').attr('off', function(d) {
        return !player.getFSM().can('surrender');
    });
    d3.select('#deal').attr('off', function(d) {
        return player.isPlayable();
    });

	if (typeof callback === 'function') {
		callback();
	}
};


/**
 * Renders the overall Game table. This method should only be called once.
 * @param {Function} callback A function to call when rendering is finished.
 */
B.Game.prototype.renderTable = function(callback) {
    var game;

    if (DEBUG) {
        log('Rendering table.');
    }

    // Display the current table's limits.
    d3.selectAll('#limits .value').
        data([this.getMinimumBet(), this.getMaximumBet()]).
        text(function(d, i) { return d;
    });

    game = this;

    // Connect game-level event handlers.
    d3.select('#deal').on('click',
        function() {
            game.deal();
        });

    d3.select('#quit').on('click',
        function() {
            game.quit();
        });

    // Update button states for visible feedback.
    d3.select('#hit').attr('off', function(d) {
        return true;
    });
    d3.select('#stand').attr('off', function(d) {
        return true;
    });
    d3.select('#surrender').attr('off', function(d) {
        return true;
    });

    // Activate the betting buttons for "pre-deal" betting value capture.
    this.renderBet();

	if (typeof callback === 'function') {
		callback();
	}
};


/**
 * Score each Hand and pay any winners, notify losers, and clean up the round.
 */
B.Game.prototype.score = function() {
	var fsm,
		hands,
		dealer,
		house,
		busted,
		bjack;

	fsm = this.getFSM();
    if (fsm.can('score')) {
	    fsm.score();
    }

	log('Scoring hands.');

	dealer = this.getDealer();
    dealer.show();
	house = dealer.getScore();
	busted = house > 21;
	bjack = dealer.isBlackjack();

    this.renderHands();

    log('Dealer has: ' + dealer.print());

	hands = this.getHands();
	hands.map(function(hand) {
		var score;

        log('Player has: ' + hand.print());

		if (!hand.isScoreable()) {
			return;
		}

		if (hand.isBlackjack()) {
			if (bjack) {
				hand.push();
			} else {
				hand.pay(B.Game.DEFAULT.PAYOUT_BLACKJACK);
			}
			return;
		}

		// All other non-blackjack hands lose if the house has blackjack. We're
		// only interested in hands that won.
		if (!bjack) {
			score = hand.getScore();
			if (score === house) {
				hand.push();
			} else if (busted || (score > house)) {
				hand.pay(B.Game.DEFAULT.PAYOUT_WINNER);
			}
		}
	});

    // Reset player's initial bet.
    this.getPlayer().placeBet(this.getMinimumBet());

	// Transition to 'postgame' state.
	setTimeout(fsm.done.bind(fsm), 0);
};


/**
 * Responds to notifications that a Hand wants to split. NOTE that unlike the
 * other Hand-related notifications, this one uses the Game to do the work.
 * @param {B.Hand} hand The hand which split.
 */
B.Game.prototype.split = function(hand) {
	var cards,
		card,
		hand2,
		shoe;

	if (DEBUG) {
		log('Hand split: ' + hand.print());
	}

	// Create the new hand and add it to our list.
	hand2 = new B.Hand(this, hand.getPlayer());
	this.getHands().push(hand2);

	// Split the cards between the two hands.
	cards = hand.getCards();
	card = cards.pop();
	hand2.getCards().push(card);

	// Set old hand from 'pair' to 'single'
	hand.getFSM().split();
	// Set new hand to 'single' from 'empty'.
	hand2.getFSM().hit();

	// Add a new card to both hands to return them to 'pair' state.
	shoe = this.getShoe();
	hand.hit(shoe.deal());
	hand2.hit(shoe.deal());

	// Once the hands are split and rebuilt we check them. In the off chance
	// they're both now Blackjack values we'd want to move directly to scoring.
	this.checkHands();
};


/**
 * Responds to notifications that a Hand is standing pat.
 * @param {B.Hand} hand The hand which is standing pat.
 */
B.Game.prototype.stand = function(hand) {

	if (DEBUG) {
		log('Hand stands: ' + hand.print());
	}

	this.checkHands();

    // Render because once a hand stands() it's likely the Dealer will show()
    // and begin updating their hand.
    this.renderHands();
};


/**
 * Start a new game, triggering initial rendering and dealing to start a Hand.
 */
B.Game.prototype.start = function() {
    var game;

	log('Game on.');

    game = this;

	// Render the game table baseline.
	this.renderTable(function() {
        // Update the player's holdings display, and the amount of the minimum bet
        // to support the new hand.
        d3.select('#holdings .value').text(game.getPlayer().getHoldings());
        d3.select('#pot .value').text(game.getPlayer().getBet());
    });
};


/**
 * Responds to notifications that a Hand surrenders.
 * @param {B.Hand} hand The hand which surrendered.
 */
B.Game.prototype.surrender = function(hand) {

	if (DEBUG) {
		log('Hand surrenders: ' + hand.print());
	}

	this.checkHands();
};


//  --------------------------------------------------------------------------- 
//  Application Bootstrap
//  --------------------------------------------------------------------------- 

/*
 * NOTE:
 */


/**
 * Options for configuration of any Game/Test instances.
 * @type {object} 
 */
B.options = null;


/**
 * Initializes the game and starts it.
 * @param {object} options Optional game configuration options.
 */
B.init = function(options) {

	DEBUG = window.location.href.toString().match(/#debug|&debug=true/);
	if (DEBUG) {
		log('Debugging output enabled.');
	}

	// Cache options for use across all Game/Test invocations.
	B.options = options;

	B.game = new B.Game(B.options);
	B.game.start();
};


//  --------------------------------------------------------------------------- 
//	Export
//  --------------------------------------------------------------------------- 


//  Export B using variant cribbed from underscore.js. The goal is to ensure
//  export works across all containers.
if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = B;
    }
    exports.B = B;
} else {
    root.B = B;
}

}(this));
