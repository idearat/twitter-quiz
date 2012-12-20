# Web Application Engineer Challenge

The Challenge Specifically States:

Implement a Blackjack game in Ruby, Javascript, Python, PHP, Clojure, Java, C++, C or Scala.

The player should start with 500 chips and have the option to bet up to 100 chips each hand. You should implement the basic rules of betting, hitting, standing, winning, losing, and pushing (tying with the dealer). Optionally you can implement the more advanced rules such as doubling down and splitting. The dealer should always hit when below 17 and stand when equal to or above 17. Please send instructions for running your program as well. We're looking to see your best code, so code as if you're writing production code. 

You should use the casino rules of play, as described in Wikipedia:

http://en.wikipedia.org/wiki/Blackjack#Rules_of_play_at_casinos

Commonly asked questions:
1. Are there rules on things I can't do/use/include? No
2. Is it okay if I make this as a webapp? Yes
3. How far should I go with respect to unit tests, coverage, CI integration, etc?  We're looking to see your best code, so code as if you're writing production code.  CI integration is a bit much, but tests are a good thing.

# Clarifying Assumptions / Design Decisions

1. The game will support only two players, the user and the dealer.
2. The game will use a single deck of cards.
3. Play must be able to continue if the shoe empties mid-game.
4. Card ordering prior to the first shuffle is consistent with a physical card
deck. In particular, from top to bottom the order of cards in an unshuffled
deck is: Ace through King of Hearts, Ace through King of Clubs, King through
Ace of Diamonds, and King through Ace of Spades. Note that this ordering
implies that using Math.ceil(Math.random() * 52) % 13 to determine card values
such that 1 is always an Ace and 13 is always a King is incorrect, albeit
simplifying.
5. Splitting is not supported in this version.

# Operation


# Files


