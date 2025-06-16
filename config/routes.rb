Rails.application.routes.draw do
  # Define your application routes per the DSL in https://guides.rubyonrails.org/routing.html

  # Redirect root to index.html
  root 'application#index'

  # Game state endpoint
  get 'game_state.json', to: 'game#state'

  # Game action endpoints
  post 'move', to: 'game#move'
  post 'treat', to: 'game#treat'
  post 'cure_disease', to: 'game#cure_disease'
  post 'retrieve', to: 'game#retrieve'
  post 'share_knowledge', to: 'game#share_knowledge'
  post 'pass', to: 'game#pass'
  post 'draw_cards', to: 'game#draw_cards'
  post 'infect_cities', to: 'game#infect_cities'
  post 'build_research_station', to: 'game#build_research_station'
  post 'discard_cards', to: 'game#discard_cards'
  post 'action_card', to: 'game#action_card'
  post 'restart_game', to: 'game#restart_game'
end
